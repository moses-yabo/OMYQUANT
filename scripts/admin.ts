import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';
import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../app/.server/database/models.ts';
import { connectToDatabase } from '../app/.server/database/connect.ts';

const { values } = parseArgs({ options: { email: { type: 'string', multiple: true }, id: { type: 'string' }, database: { type: 'string' }, revoke: { type: 'boolean' }, preview: { type: 'boolean' }, 'super-admin': { type: 'boolean' } } });
const emails = [...new Set(z.array(z.email()).min(1).parse((values.email ?? []).flatMap(value => value.split(',')).map(value => value.trim().toLowerCase())))];
const accountId = values.id ? z.string().regex(/^[a-f0-9]{24}$/i).parse(values.id) : undefined;
if (accountId && emails.length !== 1) throw new Error('Use one email when selecting an exact account ID.');
const env = loadEnv('development', process.cwd(), '');
for (const key of ['MONGODB_URI', 'MONGODB_DB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_DB_NAME']) {
  if (process.env[key] === undefined && env[key] !== undefined) process.env[key] = env[key];
}
const timeout = setTimeout(() => { console.error('Admin command timed out; inspect the account before retrying.'); process.exit(1); }, 45000);
if (values.database) process.env.MONGODB_DB_NAME = z.string().trim().min(1).max(63).parse(values.database);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
try {
  await connectToDatabase();
  console.log('Target database:', mongoose.connection.db?.databaseName);
  const accounts = await User.find({ email: { $in: emails }, active: true, ...(accountId ? { _id: accountId } : {}) }).select('_id email admin superAdmin').lean();
  const found = new Set(accounts.map(account => String(account.email)));
  const missing = emails.filter(email => !found.has(email));
  if (values.preview) console.log('Existing active accounts:', accounts.map(account => ({ email: account.email, admin: Boolean(account.admin), superAdmin: Boolean(account.superAdmin) })));
  else {
    const filter = { _id: { $in: accounts.map(account => account._id) }, active: true, ...(!values['super-admin'] ? { superAdmin: { $ne: true } } : {}) };
    const result = await User.updateMany(filter, { $set: { admin: !values.revoke, ...(values['super-admin'] ? { superAdmin: !values.revoke } : {}) } }, { runValidators: true });
    console.log(values.revoke ? 'Admin access revoked:' : 'Admin access granted:', { matched: result.matchedCount, changed: result.modifiedCount });
  }
  if (missing.length) {
    console.log('No active account found; register/sign in first, then rerun for:', missing);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Admin command failed:', { name: error instanceof Error ? error.name : 'UnknownError', code: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined });
  process.exitCode = 1;
} finally { await mongoose.disconnect(); clearTimeout(timeout); }
