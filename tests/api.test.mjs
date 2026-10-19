import { test, expect, jest } from '@jest/globals';
import assert from 'node:assert/strict';
import { createRequestHandler } from 'react-router';
import * as build from '../build/server/index.js';

const handle = createRequestHandler(build, 'production');
test('health is served as JSON by the React Router resource route', async () => {
  const response = await handle(new Request('http://localhost/api/v1/health'));
  assert.equal(response.status, 200);
  expect(await response.json()).toEqual({ data: { service: 'OMYQUANT', framework: 'React Router' } });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('cross-origin mutations are rejected before accessing the database', async () => {
  const response = await handle(new Request('http://localhost/api/v1/auth/register', {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}',
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.message, 'Cross-origin mutation denied');
});
test('cross-site requests cannot mutate authenticated resources', async () => {
  const response = await handle(new Request('http://localhost/api/v1/auth/logout', {
    method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' },
  }));
  assert.equal(response.status, 403);
});

(process.env.MONGODB_URI ? test.skip : test)('marketplace renders sample content without a configured database', async () => {
  const response = await handle(new Request('http://localhost/'));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Loading your marketplace/);
  assert.doesNotMatch(html, /Welcome to React Router/);
});
(process.env.MONGODB_URI ? test.skip : test)('frontend pages render without database access in preview mode', async () => {
  for (const path of ['/login', '/register', '/business', '/request/delivery', '/request/transport']) {
    const response = await handle(new Request(`http://localhost${path}`));
    assert.equal(response.status, 200, path);
  }
});
test('customer activity requires a signed-in account', async () => {
  const response = await handle(new Request('http://localhost/account'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/login');
});
test('frontend form actions reject cross-origin requests', async () => {
  const original = console.error;
  const log = jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (!String(args[0]).includes('origin does not match')) original(...args);
  });
  try {
  for (const path of ['/login', '/register', '/reserve', '/account', '/business', '/request/delivery']) {
    const response = await handle(new Request(`http://localhost${path}`, { method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' }));
    assert.ok([400, 403].includes(response.status), `${path}: expected framework or action origin rejection, got ${response.status}`);
  }
  } finally { log.mockRestore(); }
});
test('unknown frontend routes return 404', async () => {
  const response = await handle(new Request('http://localhost/missing-page'));
  assert.equal(response.status, 404);
});
