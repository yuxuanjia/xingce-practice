const els = {
  module: document.querySelector('#module-select'), region: document.querySelector('#region-select'), paper: document.querySelector('#paper-select'), card: document.querySelector('#question-card'),
  source: document.querySelector('#source'), progress: document.querySelector('#progress'), accuracy: document.querySelector('#accuracy'), detail: document.querySelector('#score-detail'), totalTime: document.querySelector('#total-time'), timer: document.querySelector('#timer'),
  next: document.querySelector('#new-question'), reset: document.querySelector('#reset-session'), wrongButton: document.querySelector('#wrong-list-button'), wrongCount: document.querySelector('#wrong-count'), drawer: document.querySelector('#wrong-drawer'), backdrop: document.querySelector('#drawer-backdrop'), closeDrawer: document.querySelector('#close-wrong-drawer'), wrongList: document.querySelector('#wrong-list'), clearWrong: document.querySelector('#clear-wrong-list')
};
let papers = [], cachedPapers = new Map(), current = null, questionStartedAt = 0, timerHandle = null;
const stored = JSON.parse(localStorage.getItem('xingce-practice-session') || '{}');
let session = { answered: 0, correct: 0, totalSeconds: 0, seen: [], wrong: [], ...stored };
session.seen ??= []; session.wrong ??= []; session.totalSeconds ??= 0;

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const questionId = (question) => `${question.paper.path}#${question.number}`;
const getPathBase = (path) => path.split('/').slice(0, -1).join('/') || '.';
const formatDuration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function resolveAsset(src, base) { const clean = src.trim().replace(/^['"]|['"]$/g, ''); return /^(https?:|data:)/i.test(clean) ? clean : new URL(clean, new URL(`${base}/`, window.location.href)).pathname; }
function sanitizeHtml(html, base) { const fragment = document.createElement('div'); fragment.innerHTML = html; fragment.querySelectorAll('script,style,iframe,object,embed').forEach(el => el.remove()); fragment.querySelectorAll('*').forEach(el => [...el.attributes].forEach(attr => { if (attr.name.startsWith('on')) el.removeAttribute(attr.name); if (attr.name === 'src') el.setAttribute('src', resolveAsset(attr.value, base)); })); return fragment.innerHTML; }
function toHtml(text, base) { const escaped = escapeHtml(text.trim()); const images = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${resolveAsset(src, base)}" />`); const blocks = images.split(/\n{2,}/).map(part => part.startsWith('&lt;') ? part : `<p>${part.replaceAll('\n', '<br>')}</p>`).join(''); return sanitizeHtml(blocks.replaceAll('&lt;', '<').replaceAll('&gt;', '>'), base); }
function toInlineHtml(text, base) { return toHtml(text, base).replaceAll('<p>', '').replaceAll('</p>', '<br>').replace(/<br>$/, ''); }

function parsePaper(text, paper) {
  const base = getPathBase(paper.path), sections = [...text.matchAll(/^(#{2,3}) (材料 [^\n]+|第 \d+ 题[^\n]*)$/gm)], questions = []; let material = '', materialTitle = '';
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index], heading = section[2], chunk = text.slice(section.index, sections[index + 1]?.index).trim();
    if (heading.startsWith('材料 ')) { materialTitle = heading; material = chunk.replace(/^#{2,3} 材料 [^\n]+\n?/, '').trim(); continue; }
    const title = chunk.match(/^#{2,3} 第 (\d+) 题[^\n]*\n+([\s\S]*?)(?=\n\n- \*\*A\*\*)/m);
    const optionBlock = chunk.match(/\n\n(- \*\*[A-D]\*\*[\s\S]*?)(?=\n\n\*\*答案\*\*：)/m)?.[1] || '';
    const answer = chunk.match(/\*\*答案\*\*：\s*([^\n]+)/)?.[1]?.trim() || '';
    const explanation = chunk.match(/\*\*官方解析\*\*\s*\n+([\s\S]*?)(?=\n---|$)/)?.[1]?.trim() || '';
    const options = [...optionBlock.matchAll(/^- \*\*([A-D])\*\*\.?(.*)$/gm)].map(match => ({ key: match[1], text: match[2].replace(/\s*✅\s*$/, '').trim() }));
    if (title && options.length >= 2 && answer) questions.push({ number: title[1], stem: title[2].trim(), options, answer: answer.replace(/[\s、，]/g, ''), explanation, material, materialTitle, base, paper });
  }
  return questions;
}
async function paperQuestions(paper) { if (!cachedPapers.has(paper.path)) { const text = await fetch(encodeURI(paper.path)).then(r => r.ok ? r.text() : Promise.reject(new Error('题库文件读取失败'))); cachedPapers.set(paper.path, parsePaper(text, paper)); } return cachedPapers.get(paper.path); }
function matchesFilters(paper, includePaper = true) { return (els.module.value === 'all' || paper.module === els.module.value) && (els.region.value === 'all' || paper.region === els.region.value) && (!includePaper || els.paper.value === 'all' || paper.path === els.paper.value); }
function candidates() { return papers.filter(paper => matchesFilters(paper)); }
function saveSession() { localStorage.setItem('xingce-practice-session', JSON.stringify(session)); }
function updateStats() { const pct = session.answered ? `${Math.round(session.correct / session.answered * 100)}%` : '—'; els.accuracy.textContent = pct; els.detail.textContent = session.answered ? `${session.correct} / ${session.answered} 题答对` : '还没有作答'; els.progress.textContent = `已作答 ${session.answered} 题`; els.totalTime.textContent = `累计用时 ${formatDuration(session.totalSeconds)}`; els.wrongCount.textContent = session.wrong.length; saveSession(); }
function setPapers() { els.paper.innerHTML = '<option value="all">随机试卷</option>' + papers.filter(paper => matchesFilters(paper, false)).map(paper => `<option value="${escapeHtml(paper.path)}">${escapeHtml(paper.year || '—')} · ${escapeHtml(paper.title)}（${paper.count}题）</option>`).join(''); }
function stopTimer() { if (timerHandle) clearInterval(timerHandle); timerHandle = null; return questionStartedAt ? Math.max(1, Math.floor((Date.now() - questionStartedAt) / 1000)) : 0; }
function startTimer() { stopTimer(); questionStartedAt = Date.now(); const paint = () => els.timer.textContent = formatDuration(Math.floor((Date.now() - questionStartedAt) / 1000)); paint(); timerHandle = setInterval(paint, 1000); }
function setWrong(question, selected, seconds) { const id = questionId(question), item = { id, path: question.paper.path, number: question.number, title: question.paper.title, module: question.paper.module, region: question.paper.region, selected, seconds, updatedAt: Date.now() }; session.wrong = [item, ...session.wrong.filter(entry => entry.id !== id)].slice(0, 200); }
function removeWrong(question) { session.wrong = session.wrong.filter(entry => entry.id !== questionId(question)); }
function renderWrongList() { if (!session.wrong.length) { els.wrongList.innerHTML = '<p class="empty-wrong">暂时没有错题。继续保持！</p>'; return; } els.wrongList.innerHTML = session.wrong.map(item => `<button class="wrong-item" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.module)} · 第 ${escapeHtml(item.number)} 题</strong><small>${escapeHtml(item.region || '真题')} · 已用 ${formatDuration(item.seconds)} · 你的答案 ${escapeHtml(item.selected || '未作答')}</small></button>`).join(''); }
function openDrawer() { renderWrongList(); els.drawer.classList.add('open'); els.drawer.setAttribute('aria-hidden', 'false'); els.backdrop.hidden = false; }
function closeDrawer() { els.drawer.classList.remove('open'); els.drawer.setAttribute('aria-hidden', 'true'); els.backdrop.hidden = true; }
async function openWrongQuestion(id) { const entry = session.wrong.find(item => item.id === id), paper = papers.find(item => item.path === entry?.path); if (!paper) return; closeDrawer(); els.card.innerHTML = '<div class="loading">正在打开错题…</div>'; const question = (await paperQuestions(paper)).find(item => questionId(item) === id); if (question) render(question); }

function render(question) {
  current = question; delete els.card.dataset.done; const { paper, base } = question;
  els.source.textContent = `${paper.module} · ${paper.title} · 第 ${question.number} 题`;
  const material = question.material ? `<div class="material"><span class="tag">${escapeHtml(question.materialTitle || '材料')}</span>${toHtml(question.material, base)}</div>` : '';
  els.card.innerHTML = `${material}<div class="question-top"><span class="tag">${escapeHtml(paper.module)}</span><span class="tag">${escapeHtml(paper.year || '真题')}</span><h2>${toInlineHtml(question.stem, base)}</h2></div><div class="options">${question.options.map(option => `<button class="option" data-key="${option.key}"><span class="letter">${option.key}</span><span>${toInlineHtml(option.text, base)}</span></button>`).join('')}</div><div class="answer-area"><button id="check-answer" disabled>请选择答案</button><div id="feedback"></div></div>`;
  const isMultiple = [...question.answer].filter(key => /[A-D]/.test(key)).length > 1, selected = new Set();
  els.card.querySelectorAll('.option').forEach(button => button.addEventListener('click', () => { if (els.card.dataset.done) return; if (isMultiple) selected.has(button.dataset.key) ? selected.delete(button.dataset.key) : selected.add(button.dataset.key); else { selected.clear(); selected.add(button.dataset.key); } els.card.querySelectorAll('.option').forEach(item => item.style.outline = selected.has(item.dataset.key) ? '3px solid #7db6df' : 'none'); const value = [...selected].sort().join(''), check = document.querySelector('#check-answer'); check.disabled = !value; check.textContent = `提交答案 ${value}`; }));
  document.querySelector('#check-answer').addEventListener('click', () => grade([...selected].sort().join(''))); startTimer();
}
function grade(selected) {
  const seconds = stopTimer(), correctKeys = [...current.answer].filter(key => /[A-D]/.test(key)), correct = selected === correctKeys.join('');
  els.card.dataset.done = 'yes'; session.answered++; session.totalSeconds += seconds; if (correct) { session.correct++; removeWrong(current); } else setWrong(current, selected, seconds); session.seen = [...new Set([...session.seen, questionId(current)])].slice(-500); updateStats(); renderWrongList();
  els.card.querySelectorAll('.option').forEach(button => { button.disabled = true; if (correctKeys.includes(button.dataset.key)) button.classList.add('correct'); else if (button.dataset.key === selected) button.classList.add('wrong'); }); document.querySelector('#check-answer').remove();
  document.querySelector('#feedback').innerHTML = `<div class="feedback ${correct ? 'good' : 'bad'}"><strong>${correct ? `回答正确 · 本题用时 ${formatDuration(seconds)}` : `正确答案：${escapeHtml(current.answer)} · 本题用时 ${formatDuration(seconds)}`}</strong>${current.explanation ? `<div class="explanation"><h3>官方解析</h3>${toHtml(current.explanation, current.base)}</div>` : ''}</div>`;
}
async function nextQuestion() { stopTimer(); els.card.innerHTML = '<div class="loading">正在从题库抽题…</div>'; const pool = candidates(); if (!pool.length) { els.card.innerHTML = document.querySelector('#empty-template').innerHTML; return; } for (let attempt = 0; attempt < Math.min(pool.length * 2, 30); attempt++) { const paper = pool[Math.floor(Math.random() * pool.length)], questions = await paperQuestions(paper), unseen = questions.filter(question => !session.seen.includes(questionId(question))), picks = unseen.length ? unseen : questions; if (picks.length) { render(picks[Math.floor(Math.random() * picks.length)]); return; } } els.card.innerHTML = document.querySelector('#empty-template').innerHTML; }
async function init() { const data = await fetch('data/papers.json').then(r => r.json()); papers = data.papers; [...new Set(papers.map(paper => paper.module))].forEach(module => els.module.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(module)}">${escapeHtml(module)}</option>`)); [...new Set(papers.map(paper => paper.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(region => els.region.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)); setPapers(); updateStats(); nextQuestion(); }
const refreshFilters = () => { setPapers(); nextQuestion(); };
els.module.addEventListener('change', refreshFilters); els.region.addEventListener('change', refreshFilters); els.paper.addEventListener('change', nextQuestion); els.next.addEventListener('click', nextQuestion); els.reset.addEventListener('click', () => { session = { answered: 0, correct: 0, totalSeconds: 0, seen: [], wrong: session.wrong }; updateStats(); nextQuestion(); }); els.wrongButton.addEventListener('click', openDrawer); els.closeDrawer.addEventListener('click', closeDrawer); els.backdrop.addEventListener('click', closeDrawer); els.clearWrong.addEventListener('click', () => { session.wrong = []; updateStats(); renderWrongList(); }); els.wrongList.addEventListener('click', event => { const button = event.target.closest('[data-id]'); if (button) openWrongQuestion(button.dataset.id); });
document.addEventListener('keydown', event => { if (event.target.matches('input,select,textarea')) return; const key = event.key.toUpperCase(); if (/^[A-D]$/.test(key) && !els.card.dataset.done) els.card.querySelector(`.option[data-key="${key}"]`)?.click(); if (event.key === 'Enter' && !els.card.dataset.done && !document.querySelector('#check-answer')?.disabled) document.querySelector('#check-answer')?.click(); if (key === 'N') nextQuestion(); });
init().catch(error => { els.card.innerHTML = `<div class="empty"><h2>题库索引未生成</h2><p>${escapeHtml(error.message)}。请在“刷题网页”目录运行 <code>node build-index.mjs</code>。</p></div>`; });
