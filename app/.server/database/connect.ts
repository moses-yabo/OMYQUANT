import mongoose from 'mongoose';

type MongoEnvironment = Partial<Record<'MONGODB_URI' | 'MONGODB_DB_USERNAME' | 'MONGODB_PASSWORD' | 'MONGODB_DB_NAME', string>>;

export function mongoConfiguration(env: MongoEnvironment = process.env) {
  let uri = env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI environment variable is not defined');
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  const usernamePlaceholder = /^(mongodb(?:\+srv)?:\/\/)(?:username|<db_username>)(?=:)/;
  const passwordPlaceholder = /<(?:db_password|password)>/g;
  const usesCredentialTemplate = usernamePlaceholder.test(uri) && /<(?:db_password|password)>/.test(uri);
  if (usernamePlaceholder.test(uri)) {
    if (!env.MONGODB_DB_USERNAME) throw new Error('Set MONGODB_DB_USERNAME for the MongoDB username placeholder');
    uri = uri.replace(usernamePlaceholder, (_match, prefix: string) => prefix + encodeURIComponent(env.MONGODB_DB_USERNAME!));
  }
  if (/<(?:db_password|password)>/.test(uri)) {
    if (!env.MONGODB_PASSWORD) throw new Error('Set MONGODB_PASSWORD for the MongoDB password placeholder');
    uri = uri.replace(passwordPlaceholder, () => encodeURIComponent(env.MONGODB_PASSWORD!));
  }
  if (/<[^>]+>/.test(uri))
    throw new Error('MONGODB_URI contains an unresolved placeholder; use <db_username> and <db_password> with the separate credential variables');
  // Your .env template receives encoded credentials in the URI once. For a
  // complete URI, optional separate credentials retain their override behavior.
  const credentials = env.MONGODB_DB_USERNAME || env.MONGODB_PASSWORD;
  if (credentials && (!env.MONGODB_DB_USERNAME || !env.MONGODB_PASSWORD))
    throw new Error('Set both MONGODB_DB_USERNAME and MONGODB_PASSWORD, or use a complete MONGODB_URI without either variable');
  return {
    uri,
    options: {
      serverSelectionTimeoutMS: 5000,
      ...(credentials && !usesCredentialTemplate ? { user: env.MONGODB_DB_USERNAME, pass: env.MONGODB_PASSWORD } : {}),
      ...(env.MONGODB_DB_NAME?.trim() ? { dbName: env.MONGODB_DB_NAME.trim() } : {}),
    },
  };
}

let connectionPromise: Promise<typeof mongoose> | null = null;
export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connectionPromise) {
    const { uri, options } = mongoConfiguration();
    connectionPromise = mongoose.connect(uri, options).catch(error => {
      connectionPromise = null;
      // Raw driver errors can contain connection details.
      console.error('MongoDB connection failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined,
      });
      throw error;
    });
  }
  return connectionPromise;
}

// Preserve both existing API and Google-auth imports.
export const connect = connectToDatabase;
