import { redirect } from 'react-router';
import { connectToDatabase } from './database/connect';
import { authenticate, sessionToken } from './modules/auth/auth';
import { ApiError } from './shared/http';

export async function requireAdminPage(request: Request) {
  if (!await sessionToken(request)) throw redirect('/login');
  if (!process.env.MONGODB_URI) throw new Response('Admin access requires server authentication.', { status: 403 });
  await connectToDatabase();
  try {
    const actor = await authenticate(request);
    if (!actor.admin) throw new Response('Administrator access required.', { status: 403 });
    return actor;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect('/login');
    throw error;
  }
}
