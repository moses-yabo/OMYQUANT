import { test, expect } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { registerBrowser, loginBrowser, currentBrowserUser, logoutBrowser, accountsKey, sessionKey, jwtSigningKey } from '../app/lib/browser-auth.ts';
import { SignJWT, decodeJwt } from 'jose';

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
test('browser registration persists hashed credentials and supports login/logout', async () => {
  const local = storage(); const input = { name: 'Browser User', email: 'User@example.com', password: 'a-local-demo-password-123' };
  await registerBrowser(input, local);
  const saved = JSON.parse(local.getItem(accountsKey));
  expect(saved[0].email).toBe('user@example.com'); expect(saved[0].passwordHash).toMatch(/^[a-f0-9]{64}$/);
  expect(local.getItem(accountsKey)).not.toContain(input.password);
  expect(await currentBrowserUser(local)).toBeNull();
  const user = await loginBrowser({ email: input.email, password: input.password }, local);
  expect(await currentBrowserUser(local)).toEqual(user); expect(local.getItem(sessionKey)).not.toContain('password');
  expect(local.getItem(sessionKey).split('.')).toHaveLength(3);
  expect(decodeJwt(local.getItem(sessionKey)).sub).toBe(user.id);
  logoutBrowser(local); expect(await currentBrowserUser(local)).toBeNull();
  expect(JSON.parse(local.getItem(accountsKey))).toHaveLength(1);
});
test('browser accounts reject duplicate emails, bad passwords and expired sessions', async () => {
  const local = storage(); const input = { name: 'User', email: 'user@example.com', password: 'a-local-demo-password-123' };
  await registerBrowser(input, local);
  await expect(registerBrowser(input, local)).rejects.toThrow(/already exists/);
  await expect(loginBrowser({ email: input.email, password: 'incorrect-password-long' }, local)).rejects.toThrow(/Invalid email/);
  await expect(registerBrowser({ ...input, admin: true }, local)).rejects.toThrow();
  const user = await loginBrowser({ email: input.email, password: input.password }, local);
  const claims = decodeJwt(local.getItem(sessionKey));
  const key = Uint8Array.from(local.getItem(jwtSigningKey).match(/../g), value => parseInt(value, 16));
  const expired = await new SignJWT({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  local.setItem(sessionKey, expired);
  expect(await currentBrowserUser(local)).toBeNull(); expect(local.getItem(sessionKey)).toBeNull();
  expect(await currentBrowserUser(storage())).toBeNull();
});
test('browser JWT rejects tampering and invalid audiences and survives a new storage wrapper', async () => {
  const local = storage(); const input = { name: 'JWT User', email: 'jwt@example.com', password: 'a-local-demo-password-123' };
  await registerBrowser(input, local); const user = await loginBrowser({ email: input.email, password: input.password }, local);
  const token = local.getItem(sessionKey);
  expect(await currentBrowserUser({ ...local })).toEqual(user);
  const key = Uint8Array.from(local.getItem(jwtSigningKey).match(/../g), value => parseInt(value, 16));
  const forged = await new SignJWT({ ...decodeJwt(token), aud: 'other-app' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);
  local.setItem(sessionKey, forged); expect(await currentBrowserUser(local)).toBeNull();
  local.setItem(sessionKey, token.slice(0, -4) + 'xxxx'); expect(await currentBrowserUser(local)).toBeNull();
  local.setItem(sessionKey, '{old-session-format}'); expect(await currentBrowserUser(local)).toBeNull();
});
