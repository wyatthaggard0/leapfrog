// Local stand-in for Vercel: serves public/ and runs api/*.js with the same handlers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const api = url.pathname.match(/^\/api\/([a-z-]+)$/);
    if (api) {
      const file = path.join(ROOT, 'api', `${api[1]}.js`);
      if (!fs.existsSync(file)) return notFound(res);
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return notFound(res);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return notFound(res);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
}

const { storageMode } = await import('./lib/store.js');

// If the port is taken (another dev server), try the next one.
function listen(port, triesLeft = 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${port} is busy, trying ${port + 1}…`);
      listen(port + 1, triesLeft - 1);
    } else {
      throw err;
    }
  });
  server.listen(port);
}
server.once('listening', () => {
  console.log(`Leapfrog running at http://localhost:${server.address().port}`);
  console.log(`Check-ins are saved to: ${storageMode() === 'sheets' ? 'Google Sheets' : 'data/responses.json'}`);
});
listen(PORT);
