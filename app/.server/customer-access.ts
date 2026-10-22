import { redirect } from 'react-router';
import { authenticate, sessionToken } from './modules/auth/auth';
import { connectToDatabase } from './database/connect';
import { ApiError } from './shared/http';

export async function requireCustomerPage(request: Request) {
  if (!await sessionToken(request)) throw redirect('/login');
  await connectToDatabase();
  try { return await authenticate(request); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect('/login');
    throw error;
  }
}
