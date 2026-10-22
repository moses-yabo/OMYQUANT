import { redirect } from 'react-router';
import { data, Form, Link, useNavigation } from 'react-router';
import type { Route } from './+types/work';
import { Shell } from '../components/shell';
import { api, mutationOrigin, result } from '../.server/frontend';
type Assignment = { _id: string; status: string; startsAt?: string; description?: string; pickup?: { address: string }; dropoff?: { address: string } };
export async function loader({ request }: Route.LoaderArgs) {
  const response = await api(request, 'work');
  if (response.status === 401) throw redirect('/login');
  const payload = await result<{ departures: Assignment[]; deliveries: Assignment[] }>(response);
  if (!response.ok || !payload.data) throw new Response(payload.error?.message ?? 'Unable to load assignments', { status: response.status });
  return data(payload.data, { headers: { 'Cache-Control': 'no-store' } });
}
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  const form = await request.formData();
  const kind = String(form.get('kind')); const record = String(form.get('record'));
  if (!['departure', 'delivery'].includes(kind) || !/^[a-f0-9]{24}$/i.test(record)) return data({ error: 'Invalid assignment', success: '' }, { status: 400 });
  const response = await api(request, `work/${kind}/${record}`, 'PATCH', { status: form.get('status'), ...(form.get('proof') ? { proof: form.get('proof') } : {}) });
  const payload = await result(response);
  return data({ error: response.ok ? '' : payload.error?.message ?? 'Unable to save', success: response.ok ? 'Assignment updated.' : '' }, { status: response.status });
}
export default function Work({ loaderData, actionData }: Route.ComponentProps) {
  const pending = useNavigation().state !== 'idle';
  return <Shell><div className="form-page"><Link to="/">Personal marketplace</Link><h1>My work assignments</h1><p className="muted">Only trips and deliveries assigned to your driver profile appear here. This does not grant business management or platform admin access.</p>
    {actionData?.error && <p className="notice error" role="alert">{actionData.error}</p>}{actionData?.success && <p className="notice" role="status">{actionData.success}</p>}
    {(['departures', 'deliveries'] as const).map(group => <section className="form-panel" key={group}><h2>{group === 'departures' ? 'Taxi trips' : 'Deliveries'}</h2>{!loaderData[group].length && <p>No current assignments.</p>}{loaderData[group].map(record => <article className="activity-card" key={record._id}><h3>{record.description ?? `Trip ${record._id}`}</h3><p>{record.status}</p>{record.startsAt && <p>{new Date(record.startsAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>}{record.pickup && <p>{record.pickup.address} → {record.dropoff?.address}</p>}<Form method="post"><input type="hidden" name="kind" value={group === 'departures' ? 'departure' : 'delivery'} /><input type="hidden" name="record" value={record._id} /><input type="hidden" name="status" value={group === 'departures' ? record.status === 'scheduled' ? 'departed' : 'completed' : record.status === 'assigned' ? 'collected' : 'delivered'} />{group === 'deliveries' && record.status === 'collected' && <label>Proof of delivery URL<input name="proof" type="url" required /></label>}<button className="button small" disabled={pending}>{group === 'departures' ? record.status === 'scheduled' ? 'Start trip' : 'Complete trip' : record.status === 'assigned' ? 'Mark collected' : 'Mark delivered'}</button></Form></article>)}</section>)}
  </div></Shell>;
}
