import { data, Form, useNavigation } from 'react-router';
import type { Route } from './+types/admin-users';
import { Shell } from '../components/shell';
import { requireAdminPage } from '../.server/admin-access';
import { api, mutationOrigin, result } from '../.server/frontend';

type Account = { _id: string; name: string; email: string; admin: boolean; superAdmin?: boolean };
async function guard(request: Request) {
  const actor = await requireAdminPage(request);
  if (!actor.superAdmin) throw new Response('Super administrator access required.', { status: 403 });
}
export async function loader({ request }: Route.LoaderArgs) {
  await guard(request);
  const email = new URL(request.url).searchParams.get('email')?.trim() ?? '';
  if (!email) return { email, account: null as Account | null, error: '' };
  const response = await api(request, `admin/users?${new URLSearchParams({ email })}`);
  const payload = await result<Account>(response);
  return { email, account: payload.data ?? null, error: payload.error?.message ?? '' };
}
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  await guard(request);
  if (request.method !== 'POST') throw new Response('Method not allowed.', { status: 405 });
  const form = await request.formData();
  const id = String(form.get('id') ?? '');
  const decision = form.get('admin');
  if (!/^[a-f0-9]{24}$/i.test(id) || !['true', 'false'].includes(String(decision))) return data({ error: 'Invalid account decision.', success: '' }, { status: 400 });
  const response = await api(request, `users/${id}/permissions`, 'PATCH', { admin: decision === 'true' });
  const payload = await result<Account>(response);
  return data({ error: payload.error?.message ?? '', success: response.ok ? `Administrator access ${decision === 'true' ? 'granted' : 'revoked'} for ${payload.data?.email}.` : '' }, { status: response.status });
}
export function headers() { return { 'Cache-Control': 'no-store' }; }
export function meta() { return [{ title: 'Manage administrators | OMYQUANT' }, { name: 'robots', content: 'noindex, nofollow' }]; }
export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  const pending = useNavigation().state !== 'idle';
  const account = loaderData.account;
  return <Shell><div className="form-page"><span className="eyebrow">SUPER ADMINISTRATION</span><h1>Manage administrators</h1>
    <p className="muted">Find an existing active account by its exact sign-in email. Regular administrators can review businesses.</p>
    <Form method="get" className="form-panel"><label>Account email<input type="email" name="email" required defaultValue={loaderData.email} /></label><button className="button full" disabled={pending}>Find account</button></Form>
    {loaderData.error && <p className="notice error" role="alert">{loaderData.error}</p>}
    {actionData?.error && <p className="notice error" role="alert">{actionData.error}</p>}
    {actionData?.success && <p className="notice" role="status">{actionData.success}</p>}
    {account && <section className="form-panel"><h2>{account.name}</h2><p>{account.email}</p><p>{account.superAdmin ? 'Super administrator' : account.admin ? 'Administrator' : 'Customer'}</p>
      {account.superAdmin ? <p className="muted">Super administrator access is protected and managed from the server terminal.</p> : <Form method="post"><input type="hidden" name="id" value={account._id} /><button className="button full" name="admin" value={account.admin ? 'false' : 'true'} disabled={pending}>{pending ? 'Saving…' : account.admin ? 'Revoke administrator access' : 'Grant administrator access'}</button></Form>}
    </section>}
  </div></Shell>;
}
