const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const port = Number(process.env.PORT) || 4173;
http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (error, data) => { if (error) { response.writeHead(404).end('Not found'); return; } response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data); });
}).listen(port, '127.0.0.1', () => console.log(`Static preview: http://127.0.0.1:${port}`));
