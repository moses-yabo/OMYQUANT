import { test, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SignJWT, decodeJwt } from 'jose';
import { io } from 'socket.io-client';

async function start(directory) {
  const child = spawn(process.execPath, ['build/runtime/server.js'], { env: { ...process.env, PORT: '0', DEMO_MODE: 'true', MONGODB_URI: '', LOCAL_AUTH_DIR: directory, AUTH_COOKIE_SECURE: 'false', JWT_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stderr.on('data', chunk => { output += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Auth server startup failed: ${output}`)), 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Auth server exited ${code}: ${output}`)); });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
  });
  return { url, async stop() { const exit = once(child, 'exit'); child.kill(); await exit; } };
}
const request = (url, path, body, cookie = '') => fetch(url + '/api/v1/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
const event = (socket, name) => new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`Socket event timeout: ${name}`)), 4000); socket.once(name, value => { clearTimeout(timeout); resolve(value); }); });

test('local JWT auth persists accounts, validates tokens and revokes sessions', async () => {
  const root = resolve('.local'); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, 'auth-test-'));
  let server; const sockets = [];
  try {
    server = await start(directory);
    const account = { name: 'Local User', email: 'user@example.com', password: 'correct-password-at-least-12' };
    let response = await request(server.url, 'auth/register', { ...account, admin: true }); expect(response.status).toBe(400);
    response = await request(server.url, 'auth/register', account); expect(response.status).toBe(201);
    const registered = await response.json(); expect(registered.data.admin).toBe(false); expect(JSON.stringify(registered)).not.toMatch(/password|hash/);
    expect((await request(server.url, 'auth/register', account)).status).toBe(409);
    expect((await request(server.url, 'auth/login', { email: account.email, password: 'incorrect-password-long' })).status).toBe(401);
    response = await request(server.url, 'auth/login', { email: account.email, password: account.password }); expect(response.status).toBe(200);
    const setCookie = response.headers.get('Set-Cookie'); expect(setCookie).toMatch(/HttpOnly/); expect(setCookie).toMatch(/SameSite=Lax/);
    const cookie = setCookie.split(';')[0]; const token = cookie.slice(cookie.indexOf('=') + 1); expect(token.split('.')).toHaveLength(3);
    response = await request(server.url, 'users/me', undefined, cookie); expect(response.status).toBe(200); expect((await response.json()).data.email).toBe(account.email);
    const db = new DatabaseSync(resolve(directory, 'auth.sqlite'), { readOnly: true });
    const key = Buffer.from(db.prepare('SELECT value FROM secrets WHERE name = ?').get('jwt').value, 'hex');
    const stored = db.prepare('SELECT password_hash FROM users').get().password_hash; expect(stored).not.toBe(account.password); expect(stored).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/); db.close();
    const claims = decodeJwt(token);
    const expired = await new SignJWT({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
    expect((await request(server.url, 'users/me', undefined, `omyquant_jwt=${expired}`)).status).toBe(401);
    const wrongAudience = await new SignJWT({ ...claims, aud: 'other-app' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
    expect((await request(server.url, 'users/me', undefined, `omyquant_jwt=${wrongAudience}`)).status).toBe(401);
    expect((await request(server.url, 'users/me', undefined, `omyquant_jwt=x${token}`)).status).toBe(401);
    const denied = io(server.url, { reconnection: false }); sockets.push(denied); expect((await event(denied, 'connect_error')).message).toMatch(/Sign in/);
    const first = io(server.url, { extraHeaders: { Cookie: cookie }, auth: { room: 'forged-one' }, forceNew: true, reconnection: false }); sockets.push(first); await event(first, 'connect');
    const second = io(server.url, { extraHeaders: { Cookie: cookie }, auth: { room: 'forged-two' }, forceNew: true, reconnection: false }); sockets.push(second); await event(second, 'connect');
    const refreshed = event(second, 'bookings:refresh'); first.emit('bookings:changed'); await refreshed;
    sockets.forEach(socket => socket.disconnect());
    await server.stop(); server = await start(directory);
    expect((await request(server.url, 'users/me', undefined, cookie)).status).toBe(200);
    expect((await request(server.url, 'auth/logout', {}, cookie)).status).toBe(200);
    expect((await request(server.url, 'users/me', undefined, cookie)).status).toBe(401);
    for (let i = 0; i < 10; i++) await request(server.url, 'auth/login', { email: 'missing@example.com', password: 'incorrect-password-long' });
    expect((await request(server.url, 'auth/login', { email: 'missing@example.com', password: 'incorrect-password-long' })).status).toBe(429);
  } finally {
    sockets.forEach(socket => socket.disconnect()); await server?.stop();
    expect(directory.startsWith(root + sep)).toBe(true); await rm(directory, { recursive: true, force: true });
  }
});
