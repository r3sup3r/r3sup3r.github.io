// Simple dev server with custom 404 page
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.join(__dirname, '_site');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.endsWith('/')) url += 'index.html';

  let filePath = path.join(ROOT, url);

  // Try the exact path, then with .html extension
  if (!fs.existsSync(filePath)) {
    filePath = filePath + '.html';
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // Serve custom 404 page
    const page404 = path.join(ROOT, '404.html');
    if (fs.existsSync(page404)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      fs.createReadStream(page404).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 — Not Found');
    }
  }
}).listen(PORT, () => {
  console.log(`⚡ YANGA dev server → http://localhost:${PORT}`);
});
