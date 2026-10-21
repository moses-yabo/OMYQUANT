import { data, Form, Link, redirect, useNavigation } from 'react-router';
import type { Route } from './+types/admin-businesses';
import { Shell } from '../components/shell';
import { requireAdminPage } from '../.server/admin-access';
import { api, mutationOrigin, result } from '../.server/frontend';

type Business = { _id: string; name: string; description: string; types: string[]; verified: boolean; active: boolean; contact?: { email?: string; phone?: string }; locations?: { address?: string; province?: string }[] };
type Review = { _id: string; verified: boolean; reason: string; createdAt: string; reviewer?: { name?: string } | null };
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdminPage(request);
  const search = new URL(request.url).searchParams;
  const filters = new URLSearchParams({ status: search.get('status') ?? 'pending', q: search.get('q') ?? '', page: search.get('page') ?? '1', limit: '20' });
  if (params.id) {
    const response = await api(request, `admin/businesses/${params.id}`);
    const payload = await result<{ business: Business; reviews: Review[] }>(response);
    if (!response.ok || !payload.data) throw new Response(payload.error?.message ?? 'Unable to load business.', { status: response.status });
    return data({ businesses: [] as Business[], current: payload.data.business as Business | null, reviews: payload.data.reviews, total: 0, page: 1, limit: 20, status: 'pending', query: '', saved: search.get('saved') === '1' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const response = await api(request, `admin/businesses?${filters}`);
  const payload = await result<{ businesses: Business[]; total: number; page: number; limit: number }>(response);
  if (!response.ok || !payload.data) throw new Response(payload.error?.message ?? 'Unable to load businesses.', { status: response.status });
  return data({ ...payload.data, current: null as Business | null, reviews: [] as Review[], status: filters.get('status')!, query: filters.get('q')!, saved: false }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  await requireAdminPage(request);
  if (request.method !== 'POST' || !params.id || !/^[a-f0-9]{24}$/i.test(params.id)) throw new Response('Invalid review request.', { status: 400 });
  const form = await request.formData();
  const decision = form.get('verified');
  if (decision !== 'true' && decision !== 'false') return data({ error: 'Choose a valid verification decision.' }, { status: 400 });
  const response = await api(request, `businesses/${params.id}/verification`, 'PATCH', { verified: decision === 'true', reason: String(form.get('reason') ?? '') });
  const payload = await result(response);
  if (!response.ok) return data({ error: payload.error?.message ?? 'Review could not be saved.' }, { status: response.status });
  return redirect(`/admin/businesses/${params.id}?saved=1`);
}
export function headers() { return { 'Cache-Control': 'no-store' }; }
export function meta() { return [{ title: 'Business verification | OMYQUANT admin' }, { name: 'robots', content: 'noindex, nofollow' }]; }
export default function AdminBusinesses({ loaderData: loaded, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const business = loaded.current;
  const pageLink = (page: number) => `/admin/businesses?${new URLSearchParams({ status: loaded.status, q: loaded.query, page: String(page) })}`;
  return <Shell><div className="form-page">
    <span className="eyebrow">PLATFORM ADMINISTRATION</span>
    <h1>Business verification</h1>
    <p className="muted">Review independent businesses and record your decision.</p>
    {business ? <>
      <Link className="text-button" to="/admin/businesses">← Back to review queue</Link>
      <section className="form-panel">
        <h2>{business.name}</h2>
        <p>{business.description}</p>
        <p className="notice">{business.verified ? 'Verified' : 'Verification pending'} · {business.active ? 'Active' : 'Inactive'}</p>
        <p>Services: {business.types.join(', ')}</p>
        <p>Contact: {business.contact?.email || 'Not provided'} · {business.contact?.phone || 'Not provided'}</p>
        {business.locations?.map((location, index) => <p key={index}>{location.address}, {location.province}</p>)}
        {loaded.saved && <p role="status" className="notice">Verification decision saved.</p>}
        {actionData?.error && <p role="alert" className="notice error">{actionData.error}</p>}
        <Form method="post">
          <label>Review note<textarea name="reason" maxLength={2000} placeholder="Record what you checked or why more review is needed." /></label>
          <button className="button full" name="verified" value={business.verified ? 'false' : 'true'} disabled={navigation.state !== 'idle'}>{navigation.state !== 'idle' ? 'Saving decision…' : business.verified ? 'Return to pending verification' : 'Verify business'}</button>
        </Form>
      </section>
      <section className="form-panel"><h2>Review history</h2>
        {!loaded.reviews.length && <p className="muted">No recorded decisions yet. Earlier verification changes may predate this history.</p>}
        {loaded.reviews.map(review => <div className="activity-row" key={review._id}><div><strong>{review.verified ? 'Verified' : 'Returned to pending'}</strong><p>{review.reason || 'No note provided.'}</p><small>{review.reviewer?.name ?? 'Administrator'} · {new Date(review.createdAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</small></div></div>)}
      </section>
    </> : <>
      <Form method="get" className="form-panel"><div className="form-grid">
        <label>Verification status<select name="status" defaultValue={loaded.status}><option value="pending">Pending verification</option><option value="verified">Verified</option><option value="all">All businesses</option></select></label>
        <label>Business name<input name="q" defaultValue={loaded.query} maxLength={100} /></label>
      </div><button className="button full">Filter businesses</button></Form>
      <section className="form-panel"><h2>{loaded.total} businesses</h2>
        {!loaded.businesses.length && <p className="muted">No businesses match these filters.</p>}
        {loaded.businesses.map(item => <div className="activity-row" key={item._id}><div><strong>{item.name}</strong><p>{item.types.join(', ')} · {item.verified ? 'Verified' : 'Pending verification'} · {item.active ? 'Active' : 'Inactive'}</p></div><Link className="button outline small" to={`/admin/businesses/${item._id}`}>Review business</Link></div>)}
        {loaded.page > 1 && <Link className="button outline small" to={pageLink(loaded.page - 1)}>Previous</Link>}
        {loaded.page * loaded.limit < loaded.total && <Link className="button outline small" to={pageLink(loaded.page + 1)}>Next</Link>}
      </section>
    </>}
  </div></Shell>;
}
