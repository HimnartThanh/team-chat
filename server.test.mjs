import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));

async function start(dataDir, token = '') {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: dataDir, CHAT_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 10000);
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
  });
  return { url, stop: () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); }) };
}
test('shared messages validate, persist, and survive restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'teamchat-test-'));
  let server;
  try {
    server = await start(dir);
    const post = (body, headers = {}) => fetch(`${server.url}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await fetch(server.url)).status, 200);
    assert.deepEqual((await (await fetch(`${server.url}/api/messages`)).json()).messages, []);
    assert.equal((await post({ author: 'unknown', text: 'bad' })).status, 400);
    assert.equal((await post({ author: 'user', text: '  ' })).status, 400);
    assert.equal((await post({ author: 'user', text: 'x'.repeat(12001) })).status, 400);
    assert.equal((await post({ author: 'user', text: 'blocked' }, { Origin: 'https://other.example' })).status, 403);
    const bodies = [
      { author: 'user', text: 'Thiết kế web cùng nhau', to: 'all' },
      { author: 'codex', text: '<script>alert(1)</script>', to: 'antigravity' },
      { author: 'antigravity', text: 'Đã đọc yêu cầu', to: 'user' },
    ];
    const responses = await Promise.all(bodies.map(body => post(body)));
    assert.ok(responses.every(response => response.status === 201));
    const saved = (await (await fetch(`${server.url}/api/messages`)).json()).messages;
    assert.equal(saved.length, 3);
    assert.equal(new Set(saved.map(m => m.id)).size, 3);
    assert.ok(saved.some(m => m.text === bodies[1].text));
    await server.stop(); server = await start(dir);
    assert.deepEqual((await (await fetch(`${server.url}/api/messages`)).json()).messages, saved);
  } finally { if (server) await server.stop(); await rm(dir, { recursive: true, force: true }); }
});
test('token protects both history and writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'teamchat-auth-'));
  const server = await start(dir, 'test-token');
  try {
    assert.equal((await fetch(`${server.url}/api/messages`)).status, 401);
    assert.equal((await fetch(`${server.url}/api/messages`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(`${server.url}/api/messages`, { headers: { Authorization: 'Bearer test-token' } })).status, 200);
    assert.equal((await fetch(`${server.url}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: 'codex', text: 'No' }) })).status, 401);
  } finally { await server.stop(); await rm(dir, { recursive: true, force: true }); }
});
