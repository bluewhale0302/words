const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const HOST = '127.0.0.1';
const PORT = 8000;
const ROOT = __dirname;
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(body);
}

function proxy(route, query, res) {
  const wikt = /^wikt\/(?:en|ko)\/(?:word\/[^/]+(?:\/(?:forms|translations|pronunciations|definitions))?|search)$/.test(route);
  const datamuse = /^datamuse\/words$/.test(route);
  const jisho = route === 'jisho/search/words';
  if (!wikt && !datamuse && !jisho) return reply(res, 404, JSON.stringify({ error: 'route_not_supported' }));
  const key = `${route}?${query}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return reply(res, 200, cached.body, cached.type);
  const base = jisho ? 'https://jisho.org/api/v1/search/words' : datamuse ? `https://api.datamuse.com/${route.slice('datamuse/'.length)}` : `https://api.wiktapi.dev/v1/${route.slice('wikt/'.length)}`;
  const target = `${base}${query ? `?${query}` : ''}`;
  https.get(target, { headers: { Accept: 'application/json', 'User-Agent': 'Malgyul/0.1 public-dictionary-search' } }, upstream => {
    const chunks = [];
    upstream.on('data', chunk => chunks.push(chunk));
    upstream.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const type = upstream.headers['content-type'] || 'application/json; charset=utf-8';
      if (upstream.statusCode === 200) cache.set(key, { body, type, expires: Date.now() + CACHE_MS });
      reply(res, upstream.statusCode || 502, body, type);
    });
  }).on('error', () => reply(res, 502, JSON.stringify({ error: 'dictionary_unavailable', message: '공개 사전에 연결하지 못했어요.' })));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(path.join(ROOT, 'index.html'), (err, data) => err
      ? reply(res, 500, '사이트 파일을 읽지 못했어요.', 'text/plain; charset=utf-8')
      : reply(res, 200, data, 'text/html; charset=utf-8'));
  }
  if (url.pathname.startsWith('/api/')) return proxy(url.pathname.slice(5), url.search.slice(1), res);
  reply(res, 404, 'Not found', 'text/plain; charset=utf-8');
});

server.listen(PORT, HOST, () => {
  const address = `http://${HOST}:${PORT}`;
  console.log(`말결이 ${address} 에서 실행 중입니다. 종료하려면 Ctrl+C를 누르세요.`);
  if (process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', address], { windowsHide: true });
});
