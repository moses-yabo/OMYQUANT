import { redirect } from 'react-router';
import { data, Form, Link, useNavigation } from 'react-router';
import type { Route } from './+types/enquiries';
import { Shell } from '../components/shell';
import { api, mutationOrigin, result } from '../.server/frontend';
export async function loader({ request }: Route.LoaderArgs) {
  const response = await api(request, 'enquiries');
  if (response.status === 401) throw redirect('/login');
  const payload = await result<{ _id: string; question: string; answer?: string }[]>(response);
  if (!response.ok) throw new Response(payload.error?.message ?? 'Unable to load enquiries', { status: response.status });
  const search = new URL(request.url).searchParams;
  return data({ enquiries: payload.data ?? [], listing: search.get('listing') ?? '', kind: search.get('kind') ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function action({ request }: Route.ActionArgs) {
  mutationOrigin(request);
  const form = await request.formData();
  const response = await api(request, 'enquiries', 'POST', { listing: form.get('listing'), kind: form.get('kind'), question: form.get('question') });
  const payload = await result(response);
  return data({ error: response.ok ? '' : payload.error?.message ?? 'Unable to send enquiry', success: response.ok ? 'Your enquiry has been sent to the seller.' : '' }, { status: response.status });
}
export default function Enquiries({ loaderData, actionData }: Route.ComponentProps) {
  const pending = useNavigation().state !== 'idle';
  return <Shell><div className="form-page"><Link to="/">Marketplace</Link><h1>My seller enquiries</h1>{actionData?.error && <p className="notice error" role="alert">{actionData.error}</p>}{actionData?.success && <p className="notice" role="status">{actionData.success}</p>}
    {loaderData.listing && <Form method="post" className="form-panel"><h2>Ask the seller</h2><input type="hidden" name="listing" value={loaderData.listing} /><input type="hidden" name="kind" value={loaderData.kind} /><label>Your question<textarea name="question" maxLength={4000} required /></label><button className="button" disabled={pending}>Send enquiry</button></Form>}
    <section className="form-panel"><h2>Your enquiries</h2>{!loaderData.enquiries.length && <p>No enquiries yet.</p>}{loaderData.enquiries.map(enquiry => <article className="activity-card" key={enquiry._id}><p>{enquiry.question}</p><p>{enquiry.answer ? `Seller reply: ${enquiry.answer}` : 'Awaiting seller reply.'}</p></article>)}</section>
  </div></Shell>;
}
