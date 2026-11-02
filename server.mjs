import http from 'node:http';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
await mkdir(dataDir, { recursive: true });
const log = path.join(dataDir, 'messages.jsonl');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4317);
const token = process.env.CHAT_TOKEN || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !token) {
  throw new Error('Set CHAT_TOKEN before exposing the server beyond localhost.');
}
let messages;
try {
  messages = (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  messages = [];
}
let queue = Promise.resolve();
const send = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const authorized = req => {
  if (!token) return true;
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, ''));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'");
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      // Browser writes must originate on this server. No CORS is exposed.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
        return send(res, 403, { error: 'Origin not allowed' });
      }
      if (!authorized(req)) return send(res, 401, { error: 'Cần token truy cập phòng chat.' });
      if (url.pathname === '/api/messages' && req.method === 'GET') {
        return send(res, 200, { messages });
      }
      if (url.pathname === '/api/messages' && req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Use application/json' });
        let body = '';
        for await (const part of req) {
          body += part;
          if (Buffer.byteLength(body) > 65536) return send(res, 413, { error: 'Tin nhắn quá dài.' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'JSON không hợp lệ.' }); }
        if (!['user', 'codex', 'antigravity'].includes(input.author) ||
            !['all', 'user', 'codex', 'antigravity'].includes(input.to || 'all') ||
            typeof input.text !== 'string' || !input.text.trim() || input.text.length > 12000) {
          return send(res, 400, { error: 'Cần author hợp lệ và text từ 1 đến 12.000 ký tự.' });
        }
        const message = { id: randomUUID(), author: input.author, to: input.to || 'all', text: input.text.trim(), createdAt: new Date().toISOString() };
        const write = queue.then(async () => {
          await appendFile(log, JSON.stringify(message) + '\n', 'utf8');
          messages.push(message);
        });
        queue = write.catch(() => {});
        await write;
        return send(res, 201, { message });
      }
      return send(res, 404, { error: 'API route not found' });
    }
    const asset = assets.get(url.pathname);
    if (!asset || !['GET', 'HEAD'].includes(req.method)) return send(res, 404, { error: 'Not found' });
    const bytes = await readFile(path.join(root, 'public', asset[0]));
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    console.error(error.message);
    send(res, 500, { error: 'Không thể lưu hoặc đọc tin nhắn. Hãy thử lại.' });
  }
});
server.listen(port, host, () => console.log(`Team Chat ready: http://${host}:${server.address().port}`));
