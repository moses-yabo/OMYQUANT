import { loadEnv } from 'vite';
import mongoose from 'mongoose';
import { mongoConfiguration } from '../app/.server/database/connect.ts';

// Read-only diagnostics. Never print URIs, credentials or raw driver messages.
const timeout = setTimeout(() => { console.error('MongoDB diagnostic timed out during network/server discovery.'); process.exit(1); }, 45000);
try {
  const config = mongoConfiguration({ ...loadEnv('development', process.cwd(), ''), ...process.env });
  console.log('Configuration valid:', { srv: config.uri.startsWith('mongodb+srv:'), databaseOverride: Boolean(config.options.dbName), credentialOverride: Boolean(config.options.user) });
  await mongoose.connect(config.uri, { ...config.options, autoIndex: false, autoCreate: false });
  await mongoose.connection.db!.admin().ping();
  console.log('MongoDB ping successful.');
} catch (failure) {
  const error = failure as { name?: string; code?: unknown; reason?: { type?: string; servers?: Map<unknown, { type?: string; error?: { name?: string; code?: unknown; cause?: { code?: unknown } } }> } };
  console.error('Connection diagnostics:', {
    name: error.name, code: error.code, topology: error.reason?.type,
    servers: error.reason?.servers ? [...error.reason.servers.values()].map(server => ({ type: server.type, error: server.error?.name, code: server.error?.code, cause: server.error?.cause?.code })) : undefined,
  });
  process.exitCode = 1;
} finally { await mongoose.disconnect(); clearTimeout(timeout); }
