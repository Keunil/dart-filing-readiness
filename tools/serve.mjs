import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('public');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const rawPathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const pathname = rawPathname.startsWith('/public/') ? rawPathname.slice('/public'.length) : rawPathname;
    const selectedRoot = pathname.startsWith('/screenshots/') ? resolve('screenshots') : root;
    const path = pathname === '/report.html' ? resolve('docs/development-report.html') :
      resolve(selectedRoot, '.' + (selectedRoot === root ? pathname : pathname.slice('/screenshots'.length)));
    if (pathname !== '/report.html' && path !== selectedRoot && !path.startsWith(selectedRoot + sep)) { res.writeHead(403).end(); return; }
    const file = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
