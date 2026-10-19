import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

const scrypt = promisify(derive);
const lifetime = 43200;
const issuer = 'omyquant-local';
const audience = 'omyquant-web';
const databases = new Map<string, DatabaseSync>();
export class LocalAuthError extends Error { constructor(public status: number, message: string) { super(message); } }
type UserRow = { id: string; name: string; email: string; password_hash: string; active: number };
export const localAuthEnabled = () => !process.env.MONGODB_URI && (process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true' || process.env.LOCAL_AUTH === 'true');
function database() {
  const directory = resolve(process.env.LOCAL_AUTH_DIR ?? '.local');
  const path = resolve(directory, 'auth.sqlite');
  const existing = databases.get(path); if (existing) return existing;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path); chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (jti TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO secrets (name, value) VALUES (?, ?)').run('jwt', randomBytes(32).toString('hex'));
  databases.set(path, db); return db;
}
function signingKey() {
  if (process.env.JWT_SECRET) {
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    if (key.length < 32) throw new LocalAuthError(503, 'JWT_SECRET must contain at least 32 bytes.');
    return key;
  }
  const row = database().prepare('SELECT value FROM secrets WHERE name = ?').get('jwt') as { value: string };
  return Buffer.from(row.value, 'hex');
}
const safeUser = (row: UserRow) => ({ id: row.id, name: row.name, email: row.email, admin: false });
function throttle(email: string, kind: string, limit: number) {
  const now = Math.floor(Date.now() / 1000); const db = database();
  db.prepare('DELETE FROM attempts WHERE expires_at <= ?').run(now);
  const bucket = `${kind}:${createHash('sha256').update(email).digest('hex')}:${Math.floor(now / 900)}`;
  const row = db.prepare('INSERT INTO attempts (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count').get(bucket, now + 1800) as { count: number };
  if (row.count > limit) throw new LocalAuthError(429, 'Too many attempts. Please try again in 15 minutes.');
}
export async function registerLocal(input: { name: string; email: string; password: string }) {
  throttle(input.email, 'register', 5);
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(input.password, salt, 64) as Buffer;
  const user = { id: randomBytes(12).toString('hex'), name: input.name, email: input.email, password_hash: `${salt}:${hash.toString('hex')}`, active: 1 };
  try { database().prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(user.id, user.name, user.email, user.password_hash); }
  catch (error) { if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new LocalAuthError(409, 'An account with that email already exists.'); throw error; }
  return safeUser(user);
}
export async function loginLocal(email: string, password: string) {
  throttle(email, 'login', 10);
  const row = database().prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email) as UserRow | undefined;
  const [salt, hex] = (row?.password_hash ?? ('0'.repeat(32) + ':' + '0'.repeat(128))).split(':');
  const actual = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hex, 'hex');
  if (!row || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new LocalAuthError(401, 'Invalid credentials');
  const now = Math.floor(Date.now() / 1000); const expiresAt = now + lifetime;
  const jti = randomBytes(32).toString('hex');
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(row.id).setIssuer(issuer).setAudience(audience).setIssuedAt(now).setExpirationTime(expiresAt).setJti(jti).sign(signingKey());
  database().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  database().prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').run(jti, row.id, expiresAt);
  return { token, user: safeUser(row), expiresIn: lifetime };
}
function tokenFromCookie(header: string | undefined | null) {
  const value = header?.split(';').map(v => v.trim()).find(v => v.startsWith('omyquant_jwt='))?.slice('omyquant_jwt='.length);
  if (!value || value.length > 4096) throw new LocalAuthError(401, 'Authentication required');
  return value;
}
export function jwtCookie(token: string, clear = false) {
  const secure = process.env.AUTH_COOKIE_SECURE === 'true' || (process.env.AUTH_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
  return `omyquant_jwt=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : lifetime}${secure ? '; Secure' : ''}`;
}
export async function authenticateLocalCookie(header: string | undefined | null) {
  try {
    const token = tokenFromCookie(header);
    const { payload, protectedHeader } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer, audience, requiredClaims: ['sub', 'jti', 'iat', 'exp'] });
    if (protectedHeader.typ !== 'JWT' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') throw new Error('Invalid claims');
    const session = database().prepare('SELECT user_id FROM sessions WHERE jti = ? AND user_id = ? AND expires_at > ?').get(payload.jti, payload.sub, Math.floor(Date.now() / 1000));
    const user = session && database().prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.sub) as UserRow | undefined;
    if (!user) throw new Error('Revoked session');
    return { user: safeUser(user), jti: payload.jti };
  } catch (error) { if (error instanceof LocalAuthError && error.status === 503) throw error; throw new LocalAuthError(401, 'Session expired, invalid or revoked. Please sign in.'); }
}
export async function logoutLocal(header: string | null) {
  const session = await authenticateLocalCookie(header);
  database().prepare('DELETE FROM sessions WHERE jti = ?').run(session.jti);
}
