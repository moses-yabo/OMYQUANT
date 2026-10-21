import { redirect } from 'react-router';
import type { Route } from './+types/admin-index';
import { requireAdminPage } from '../.server/admin-access';
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminPage(request);
  return redirect('/admin/businesses');
}
