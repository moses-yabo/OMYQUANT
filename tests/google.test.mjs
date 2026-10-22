import { afterEach, beforeAll, beforeEach, expect, jest, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import * as db from '../app/.server/database/models.ts';
import { digest, hashPassword, sessionCookie } from '../app/.server/modules/auth/auth.ts';
import { googleAuthorization, googleConfig, googleAvailability, exchangeGoogleCode } from '../app/.server/modules/auth/google-provider.ts';
import { GoogleAccountConflict, resolveGoogleUser } from '../app/.server/modules/auth/google-identity.ts';
import { completeGoogle, consumeGoogleTransaction, googleCookie, googleFailure, startGoogle } from '../app/.server/modules/auth/google.ts';

const config = { clientId: 'test-client', clientSecret: 'test-only-secret', redirectUri: 'https://example.test/auth/google/callback' };
const transaction = { state: 'expected-state', nonce: 'expected-nonce', verifier: 'a'.repeat(43) };
const profile = { sub: 'google-subject', email: 'person@example.test', emailVerified: true, name: 'Google Person' };
const userId = 'a'.repeat(24);
const otherUserId = 'b'.repeat(24);
let pair;
let jwk;
const initialEnv = { ...process.env };

beforeAll(async () => {
  pair = await generateKeyPair('RS256');
  jwk = { ...await exportJWK(pair.publicKey), kid: 'test-google-key', alg: 'RS256', use: 'sig' };
});
beforeEach(() => {
  process.env.MONGODB_URI = 'mongodb://unused-in-unit-test';
  process.env.APP_ORIGIN = 'https://example.test';
  process.env.GOOGLE_CLIENT_ID = config.clientId;
  process.env.GOOGLE_CLIENT_SECRET = config.clientSecret;
  process.env.GOOGLE_REDIRECT_URI = config.redirectUri;
  process.env.NODE_ENV = 'production';
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in initialEnv)) delete process.env[key];
  Object.assign(process.env, initialEnv);
});

function callback(query = 'code=test-code&state=expected-state', cookie = '') {
  return new Request(`${config.redirectUri}?${query}`, { headers: cookie ? { Cookie: cookie } : {} });
}
async function idToken(claims = {}, key = pair.privateKey) {
  return new SignJWT({ iss: 'https://accounts.google.com', aud: config.clientId, sub: profile.sub, email: profile.email, email_verified: true, name: profile.name, nonce: transaction.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(key);
}
function providerFetch(token, tokenStatus = 200) {
  return jest.fn(async (url, options) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      expect(options.method).toBe('POST');
      const form = new URLSearchParams(options.body);
      expect(form.get('code_verifier')).toBe(transaction.verifier);
      expect(form.get('client_secret')).toBe(config.clientSecret);
      expect(form.get('redirect_uri')).toBe(config.redirectUri);
      return Response.json(tokenStatus === 200 ? { access_token: 'discard-this-access-token', token_type: 'Bearer', id_token: token } : { error: 'invalid_grant' }, { status: tokenStatus });
    }
    expect(String(url)).toBe('https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({ keys: [jwk] });
  });
}
function connection() {
  jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  for (const model of [db.User, db.AuthIdentity, db.OAuthTransaction]) jest.spyOn(model, 'init').mockResolvedValue(model);
}
function identities({ identity = null, emailExists = null, user = { _id: userId, active: true } } = {}) {
  const session = { unitTest: true };
  jest.spyOn(mongoose.connection, 'transaction').mockImplementation(work => work(session));
  const findIdentity = jest.spyOn(db.AuthIdentity, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(identity) });
  const findUser = jest.spyOn(db.User, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(user) });
  const exists = jest.spyOn(db.User, 'exists').mockReturnValue({ session: jest.fn().mockResolvedValue(emailExists) });
  const createUser = jest.spyOn(db.User, 'create').mockResolvedValue([{ _id: userId }]);
  const createIdentity = jest.spyOn(db.AuthIdentity, 'create').mockResolvedValue([{}]);
  return { session, findIdentity, findUser, exists, createUser, createIdentity };
}

test('authorization uses random state/nonce and S256 PKCE with minimum scopes', async () => {
  const first = await googleAuthorization(config);
  const second = await googleAuthorization(config);
  expect(first.transaction).not.toEqual(second.transaction);
  expect(first.url.origin).toBe('https://accounts.google.com');
  expect(first.url.searchParams.get('scope')).toBe('openid email profile');
  expect(first.url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(first.transaction.verifier).digest('base64url'));
  expect(first.url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(first.url.href).not.toContain(config.clientSecret);
  expect(first.url.searchParams.has('access_type')).toBe(false);
});

test('a signed Google ID token yields only a verified identity profile', async () => {
  const fetcher = providerFetch(await idToken());
  await expect(exchangeGoogleCode(config, new URL(callback().url), transaction, fetcher)).resolves.toEqual(profile);
});

test.each([
  ['nonce', { nonce: 'wrong-nonce' }], ['audience', { aud: 'other-client' }],
  ['issuer', { iss: 'https://attacker.test' }], ['expiration', { exp: Math.floor(Date.now() / 1000) - 1000 }],
  ['unverified email', { email_verified: false }], ['missing subject', { sub: undefined }],
])('Google token rejects invalid %s', async (_, claims) => {
  await expect(exchangeGoogleCode(config, new URL(callback().url), transaction, providerFetch(await idToken(claims)))).rejects.toThrow();
});

test('Google token rejects invalid signatures', async () => {
  const wrong = await generateKeyPair('RS256');
  await expect(exchangeGoogleCode(config, new URL(callback().url), transaction, providerFetch(await idToken({}, wrong.privateKey)))).rejects.toThrow();
});
test.each(['code=x&state=wrong', 'code=x', 'code=x&code=y&state=expected-state', 'error=access_denied&state=expected-state'])('invalid or denied callback is rejected: %s', async query => {
  const fetcher = jest.fn();
  await expect(exchangeGoogleCode(config, new URL(callback(query).url), transaction, fetcher)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
test('provider token exchange errors are rejected', async () => {
  await expect(exchangeGoogleCode(config, new URL(callback().url), transaction, providerFetch('', 400))).rejects.toThrow();
});
test('callback origin/path cannot be chosen by browser input', async () => {
  await expect(exchangeGoogleCode(config, new URL('https://attacker.test/auth/google/callback?code=x&state=expected-state'), transaction, jest.fn())).rejects.toThrow();
});

test('Google-only user and identity are created in one transaction without a password', async () => {
  const { session, createUser, createIdentity } = identities();
  await expect(resolveGoogleUser(profile)).resolves.toBe(userId);
  expect(createUser).toHaveBeenCalledWith([{ name: profile.name, email: profile.email }], { session });
  expect(createIdentity).toHaveBeenCalledWith([{ user: userId, provider: 'google', providerUserId: profile.sub }], { session });
  await expect(new db.User({ name: profile.name, email: profile.email }).validate()).resolves.toBeUndefined();
});
test('returning Google identity selects its user even if its email changed', async () => {
  const { createUser, exists } = identities({ identity: { user: userId } });
  await expect(resolveGoogleUser({ ...profile, email: 'changed@example.test' })).resolves.toBe(userId);
  expect(createUser).not.toHaveBeenCalled();
  expect(exists).not.toHaveBeenCalled();
});
test('matching email alone never links an existing account', async () => {
  const { createUser, createIdentity } = identities({ emailExists: { _id: userId } });
  await expect(resolveGoogleUser(profile)).rejects.toBeInstanceOf(GoogleAccountConflict);
  expect(createUser).not.toHaveBeenCalled();
  expect(createIdentity).not.toHaveBeenCalled();
});
test('explicit linking preserves user and password records even with a different email', async () => {
  const { createUser, createIdentity, exists } = identities();
  await expect(resolveGoogleUser(profile, userId)).resolves.toBe(userId);
  expect(createIdentity).toHaveBeenCalled();
  expect(createUser).not.toHaveBeenCalled();
  expect(exists).not.toHaveBeenCalled();
});
test('a Google identity cannot be linked to another user', async () => {
  const { createIdentity } = identities({ identity: { user: otherUserId } });
  await expect(resolveGoogleUser(profile, userId)).rejects.toMatchObject({ status: 409 });
  expect(createIdentity).not.toHaveBeenCalled();
});
test('inactive linked accounts cannot authenticate', async () => {
  identities({ identity: { user: userId }, user: null });
  await expect(resolveGoogleUser(profile)).rejects.toMatchObject({ status: 403 });
});
test('database uniqueness arbitrates concurrent identity claims without email auto-linking', async () => {
  const { createIdentity } = identities();
  createIdentity.mockRejectedValue({ code: 11000 });
  await expect(resolveGoogleUser(profile, userId)).rejects.toBeInstanceOf(GoogleAccountConflict);
  const indexes = db.AuthIdentity.schema.indexes();
  expect(indexes).toContainEqual([{ provider: 1, providerUserId: 1 }, expect.objectContaining({ unique: true })]);
  expect(indexes).toContainEqual([{ user: 1, provider: 1 }, expect.objectContaining({ unique: true })]);
});

test('OAuth transaction is cookie-bound, expiring and atomically consumed once', async () => {
  const token = '1'.repeat(64);
  const cookie = await googleCookie().serialize(token);
  const consume = jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValueOnce(transaction).mockResolvedValueOnce(null);
  await expect(consumeGoogleTransaction(callback(undefined, cookie))).resolves.toEqual(transaction);
  expect(consume).toHaveBeenCalledWith({ digest: digest(token), state: transaction.state, expiresAt: { $gt: expect.any(Date) } });
  await expect(consumeGoogleTransaction(callback(undefined, cookie))).rejects.toMatchObject({ status: 400 });
  await expect(consumeGoogleTransaction(callback())).rejects.toMatchObject({ status: 400 });
});
test('invalid state cannot consume an unrelated transaction', async () => {
  const consume = jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValue(null);
  await expect(consumeGoogleTransaction(callback('state=x&state=y', await googleCookie().serialize('1'.repeat(64))))).rejects.toThrow();
  expect(consume).not.toHaveBeenCalled();
});
test('initiation requires a same-origin POST and never starts from GET', async () => {
  for (const request of [new Request('https://example.test/auth/google'), new Request('https://example.test/auth/google', { method: 'POST' }), new Request('https://example.test/auth/google', { method: 'POST', headers: { Origin: 'https://attacker.test' } })]) {
    await expect(startGoogle(request)).rejects.toBeDefined();
  }
});
test('initiation persists a short-lived server transaction and a secure opaque cookie', async () => {
  connection();
  const create = jest.spyOn(db.OAuthTransaction, 'create').mockResolvedValue({});
  const response = await startGoogle(new Request('https://example.test/auth/google', { method: 'POST', headers: { Origin: 'https://example.test' }, body: new URLSearchParams({ intent: 'login', returnTo: 'https://attacker.test' }) }));
  expect(response.status).toBe(303);
  const url = new URL(response.headers.get('Location'));
  expect(url.origin).toBe('https://accounts.google.com');
  expect(create.mock.calls[0][0]).toMatchObject({ intent: 'login', state: url.searchParams.get('state'), nonce: url.searchParams.get('nonce'), expiresAt: expect.any(Date) });
  const cookie = response.headers.get('Set-Cookie');
  expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=Lax/i);
  expect(cookie).not.toContain(create.mock.calls[0][0].verifier);
});
test('authenticated linking requires a fresh password and is bound to the current session', async () => {
  connection();
  const oldToken = '2'.repeat(64);
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: userId });
  const account = { _id: userId, active: true, passwordHash: await hashPassword('existing-password-123') };
  jest.spyOn(db.User, 'findOne').mockImplementation(() => ({ ...account, select: async () => account }));
  jest.spyOn(db.LoginAttempt, 'findOneAndUpdate').mockResolvedValue({ count: 1 });
  const create = jest.spyOn(db.OAuthTransaction, 'create').mockResolvedValue({});
  const request = password => new Request('https://example.test/auth/google', { method: 'POST', headers: { Origin: 'https://example.test' }, body: new URLSearchParams({ intent: 'link', password }) });
  const valid = request('existing-password-123'); valid.headers.set('Cookie', await sessionCookie.serialize(oldToken));
  await expect(startGoogle(valid)).resolves.toHaveProperty('status', 303);
  expect(create.mock.calls[0][0]).toMatchObject({ intent: 'link', user: userId, sessionDigest: digest(oldToken) });
  create.mockClear();
  const invalid = request('incorrect-password-123'); invalid.headers.set('Cookie', await sessionCookie.serialize(oldToken));
  await expect(startGoogle(invalid)).rejects.toMatchObject({ status: 401 });
  expect(create).not.toHaveBeenCalled();
});
test('completed Google login rotates the existing session and redirects only to /account', async () => {
  connection(); identities({ identity: { user: userId } });
  jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValue({ ...transaction, intent: 'login' });
  const token = await idToken();
  jest.spyOn(globalThis, 'fetch').mockImplementation(providerFetch(token));
  const create = jest.spyOn(db.Session, 'create').mockResolvedValue({});
  const remove = jest.spyOn(db.Session, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
  const old = '2'.repeat(64);
  const cookie = `${await googleCookie().serialize('1'.repeat(64))}; ${await sessionCookie.serialize(old)}`;
  const response = await completeGoogle(callback('code=x&state=expected-state&returnTo=https://attacker.test', cookie));
  expect(response.headers.get('Location')).toBe('/account');
  const issued = await sessionCookie.parse(response.headers.getSetCookie().find(value => value.startsWith('omyquant_session=')));
  expect(issued).not.toBe(old);
  expect(create).toHaveBeenCalledWith({ user: userId, digest: digest(issued), expiresAt: expect.any(Date) });
  expect(remove).toHaveBeenCalledWith({ digest: digest(old) });
  expect(response.headers.getSetCookie().find(value => value.startsWith('omyquant_google='))).toMatch(/Max-Age=0/);
});
test('link callback rejects an account/session switch before creating any identity', async () => {
  connection();
  jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValue({ ...transaction, intent: 'link', user: userId, sessionDigest: digest('old-session') });
  jest.spyOn(globalThis, 'fetch').mockImplementation(providerFetch(await idToken()));
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: otherUserId });
  jest.spyOn(db.User, 'findOne').mockResolvedValue({ _id: otherUserId, active: true });
  const create = jest.spyOn(db.AuthIdentity, 'create');
  const cookie = `${await googleCookie().serialize('1'.repeat(64))}; ${await sessionCookie.serialize('2'.repeat(64))}`;
  await expect(completeGoogle(callback(undefined, cookie))).rejects.toMatchObject({ status: 401 });
  expect(create).not.toHaveBeenCalled();
});
test('link callback for the same reauthenticated session links and rotates that account session', async () => {
  connection();
  const old = '2'.repeat(64);
  jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValue({ ...transaction, intent: 'link', user: userId, sessionDigest: digest(old) });
  jest.spyOn(globalThis, 'fetch').mockImplementation(providerFetch(await idToken()));
  jest.spyOn(db.Session, 'findOne').mockResolvedValue({ user: userId });
  const { createIdentity, createUser } = identities();
  // authenticate() awaits the query, while identity resolution adds .session().
  jest.spyOn(db.User, 'findOne').mockImplementation(() => ({ _id: userId, active: true, session: async () => ({ _id: userId, active: true }) }));
  const createSession = jest.spyOn(db.Session, 'create').mockResolvedValue({});
  jest.spyOn(db.Session, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
  const cookie = `${await googleCookie().serialize('1'.repeat(64))}; ${await sessionCookie.serialize(old)}`;
  const response = await completeGoogle(callback(undefined, cookie));
  expect(response.headers.get('Location')).toBe('/account');
  expect(createIdentity).toHaveBeenCalled();
  expect(createUser).not.toHaveBeenCalled();
  expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ user: userId }));
});
test('failed token verification does not create users, identities or sessions', async () => {
  connection();
  jest.spyOn(db.OAuthTransaction, 'findOneAndDelete').mockResolvedValue({ ...transaction, intent: 'login' });
  jest.spyOn(globalThis, 'fetch').mockImplementation(providerFetch(await idToken({ nonce: 'wrong' })));
  const createUser = jest.spyOn(db.User, 'create');
  const createIdentity = jest.spyOn(db.AuthIdentity, 'create');
  const createSession = jest.spyOn(db.Session, 'create');
  await expect(completeGoogle(callback(undefined, await googleCookie().serialize('1'.repeat(64))))).rejects.toThrow();
  expect(createUser).not.toHaveBeenCalled(); expect(createIdentity).not.toHaveBeenCalled(); expect(createSession).not.toHaveBeenCalled();
});
test('provider failures show only fixed messages and clear the transaction cookie', async () => {
  const response = await googleFailure(new Error('secret-access-token-and-client-secret'));
  expect(response.headers.get('Location')).toBe('/login?google=failed');
  expect([...response.headers].join(' ')).not.toContain('secret-access-token');
  expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
});

test('database outages have a specific safe Google sign-in message without exposing connection details', async () => {
  const failure = Object.assign(new Error('secret-mongodb-uri-and-password'), { name: 'MongooseServerSelectionError' });
  const response = await googleFailure(failure);
  expect(response.headers.get('Location')).toBe('/login?google=database_unavailable');
  expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
  expect([...response.headers].join(' ')).not.toContain('secret-mongodb');
});
test('configuration remains server-only and Google cannot run in browser demo mode', () => {
  const request = new Request(config.redirectUri);
  expect(googleConfig(request)).toEqual(config);
  delete process.env.MONGODB_URI;
  expect(googleAvailability(request)).toMatchObject({ enabled: false });
  process.env.MONGODB_URI = 'mongodb://unused';
  delete process.env.GOOGLE_CLIENT_SECRET;
  expect(googleAvailability(request).reason).not.toContain(config.clientSecret);
});
test('production rejects HTTP and mismatched callback origins', () => {
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/auth/google/callback';
  expect(() => googleConfig(new Request(config.redirectUri))).toThrow();
  process.env.GOOGLE_REDIRECT_URI = 'https://attacker.test/auth/google/callback';
  expect(() => googleConfig(new Request(config.redirectUri))).toThrow();
});
