import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (requestPath === '/') {
    res.writeHead(302, { Location: '/%E5%88%B7%E9%A2%98%E7%BD%91%E9%A1%B5/' }); res.end(); return;
  }
  const safePath = normalize(requestPath).replace(/^[/\\]+/, '');
  let file = join(root, safePath);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('刷题网页已启动：http://127.0.0.1:4173'));
