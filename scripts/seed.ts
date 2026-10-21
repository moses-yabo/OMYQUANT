import { loadEnv } from 'vite';
import mongoose from 'mongoose';
import { sampleSeedDocuments, seedSampleCatalog } from '../app/.server/database/seed.ts';
import { connectToDatabase } from '../app/.server/database/connect.ts';

const env = loadEnv('development', process.cwd(), '');
for (const key of ['MONGODB_URI', 'MONGODB_DB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_DB_NAME']) {
  if (process.env[key] === undefined && env[key] !== undefined) process.env[key] = env[key];
}
const preview = process.argv.includes('--dry-run');
// Bound DNS/network failures too, without printing credentials or raw errors.
const timeout = setTimeout(() => { console.error('Seed timed out. Check Atlas connectivity; rerunning is safe.'); process.exit(1); }, 45000);
try {
  if (preview) {
    const counts: Record<string, number> = {};
    for (const { model } of sampleSeedDocuments()) counts[model] = (counts[model] ?? 0) + 1;
    console.log('Sample seed preview (no database access):', counts);
  } else {
    await connectToDatabase();
    console.log('Sample seed inserted records:', await seedSampleCatalog());
    console.log('Existing records and inventory were preserved. Sample providers cannot sign in.');
  }
} catch (error) {
  console.error('Sample seed failed:', { name: error instanceof Error ? error.name : 'UnknownError', code: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined });
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  clearTimeout(timeout);
}
