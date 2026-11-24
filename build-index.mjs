import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const modules = [
  ['01-政治理论', '政治理论'],
  ['02-常识判断', '常识判断'],
  ['03-言语理解与表达', '言语理解与表达'],
  ['04-数量关系', '数量关系'],
  ['05-判断推理', '判断推理'],
  ['06-资料分析', '资料分析'],
];

const papers = [];
for (const [folder, module] of modules) {
  const names = (await readdir(join(root, folder))).filter((name) => name.endsWith('.md') && name !== 'README.md');
  for (const name of names) {
    const path = join(root, folder, name);
    const text = await readFile(path, 'utf8');
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? '';
    const field = (key) => frontmatter.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, 'm'))?.[1]?.trim() ?? '';
    const count = (text.match(/^#{2,3} 第 \d+ 题/mg) ?? []).length;
    if (!count) continue;
    papers.push({
      module,
      title: field('试卷') || name.replace(/\.md$/, ''),
      region: field('地区'),
      year: field('年份'),
      count,
      path: relative(join(root, '刷题网页'), path).replaceAll('\\', '/'),
    });
  }
}

papers.sort((a, b) => a.module.localeCompare(b.module, 'zh-CN') || b.year.localeCompare(a.year, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN'));
await mkdir(join(root, '刷题网页/data'), { recursive: true });
await writeFile(join(root, '刷题网页/data/papers.json'), JSON.stringify({ generatedAt: new Date().toISOString(), papers }, null, 2));
console.log(`已生成 ${papers.length} 份试卷索引，包含 ${papers.reduce((sum, paper) => sum + paper.count, 0)} 道可识别题目。`);
