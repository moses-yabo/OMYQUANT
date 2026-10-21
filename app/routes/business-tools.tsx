import { data, Form, Link, redirect, useNavigation } from 'react-router';
import type { Route } from './+types/business-tools';
import { Shell } from '../components/shell';
import { api, result, mutationOrigin } from '../.server/frontend';
import { authenticate, sessionToken } from '../.server/modules/auth/auth';
import { connectToDatabase } from '../.server/database/connect';
import { businessTool, toolsPage, toolKey, toolMutation, toolDefinitions } from '../.server/modules/business-tools';
import { ApiError } from '../.server/shared/http';
import { boundedBody, imageBucket, imageLimit, ImageError, storeImage } from '../.server/database/images';
import { businessToolLabels } from '../lib/business-tools';
import { zar } from '../lib/marketplace';
import { z } from 'zod';
import { TAXI_PASSENGER_CAPACITY, taxiSeatsAvailable } from '../lib/taxi-capacity';

async function actorFor(request: Request) {
  if (!await sessionToken(request)) throw redirect('/login');
  await connectToDatabase();
  try { return await authenticate(request); }
  catch (error) { if (error instanceof ApiError && error.status === 401) throw redirect('/login'); throw error; }
}
export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await actorFor(request);
  try {
    const loaded = await toolsPage(actor, params.id!, new URL(request.url));
    // Serialize database values explicitly for the route boundary.
    return data(JSON.parse(JSON.stringify(loaded)) as ToolsData, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { if (error instanceof ApiError) throw new Response(error.message, { status: error.status }); if (error instanceof z.ZodError) throw new Response('Invalid business tool filters.', { status: 400 }); throw error; }
}
type RecordItem = { _id: string; name?: string; registration?: string; status?: string; active?: boolean; quantity?: number; price?: number; dailyPrice?: number; total?: number; seats?: number; remaining?: number; capacity?: number; start?: string; end?: string; startsAt?: string; items?: { name: string; quantity: number }[]; customer?: string; trailer?: string; departure?: string };
type ToolsData = { business: { _id: string; name: string }; available: (keyof typeof businessToolLabels)[]; tool: keyof typeof businessToolLabels; records: RecordItem[]; total: number; page: number; limit: number; vehicles: { _id: string; registration: string }[]; routes: { _id: string; name: string }[] };
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  const actor = await actorFor(request);
  let uploaded: { id: string; url: string } | undefined;
  try {
    if (request.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const bytes = await boundedBody(request, imageLimit + 65536);
    const form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' } }).formData();
    const get = (key: string) => String(form.get(key) ?? '');
    const num = (key: string) => Number(get(key));
    const tool = toolKey(get('tool'));
    await businessTool(actor, params.id!, tool);
    let path: string = toolDefinitions[tool].path;
    let method = 'POST';
    let payload: Record<string, unknown> = { business: params.id };
    const location = { address: get('address'), province: get('province') };
    if (get('intent') === 'status') {
      path = await toolMutation(actor, params.id!, tool, get('record'));
      method = 'PATCH';
      if (['orders', 'departures'].includes(tool)) path += '/status';
      if (['orders', 'departures', 'reservations', 'products', 'livestock'].includes(tool)) payload = { status: get('status') };
      else if (tool === 'trailers') payload = { active: get('status') === 'active' };
      else throw new ApiError(400, 'Unsupported status action');
    } else if (get('intent') === 'create') {
      if (['products', 'livestock', 'trailers'].includes(tool)) {
        const file = form.get('imageFile');
        if (file instanceof File && file.size) uploaded = await storeImage(new Uint8Array(await file.arrayBuffer()), params.id!, file.type);
        payload = { ...payload, name: get('name'), location, images: uploaded ? [uploaded.url] : [] };
      }
      if (tool === 'products' || tool === 'livestock') payload = { ...payload, description: get('description'), price: Math.round(num('price') * 100), quantity: num('quantity'), status: get('status'), ...(tool === 'products' ? { category: get('category'), unit: get('unit') } : { animalCategory: get('animalCategory'), breed: get('breed'), ageMonths: num('ageMonths'), sex: get('sex'), healthDocuments: [] }) };
      else if (tool === 'trailers') payload = { ...payload, trailerType: get('trailerType'), dimensions: { length: num('length'), width: num('width'), height: num('height') }, payloadKg: num('payloadKg'), dailyPrice: Math.round(num('price') * 100), documents: [], active: true };
      else if (tool === 'vehicles') payload = { ...payload, registration: get('registration'), capacity: num('capacity'), documents: [] };
      else if (tool === 'routes') payload = { ...payload, name: get('name'), mode: get('mode'), scheduled: true, stops: [location, { address: get('dropoffAddress'), province: get('dropoffProvince') }] };
      else if (tool === 'departures') payload = { ...payload, vehicle: get('vehicle'), route: get('route'), startsAt: `${get('startsAt')}:00+02:00`, price: Math.round(num('price') * 100) };
      else throw new ApiError(400, 'This tool does not create listings');
    } else throw new ApiError(400, 'Unknown action');
    const response = await api(request, path, method, payload);
    const parsed = await result(response);
    if (!response.ok) {
      if (uploaded && response.status < 500) await imageBucket().then(async bucket => { const { default: mongoose } = await import('mongoose'); await bucket.delete(new mongoose.Types.ObjectId(uploaded!.id)); }).catch(() => {});
      return data({ error: parsed.error?.issues?.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') || parsed.error?.message || 'Unable to save.', success: '' }, { status: response.status });
    }
    return data({ error: '', success: 'Saved successfully.' });
  } catch (error) {
    if (error instanceof ApiError || error instanceof ImageError) return data({ error: error.message, success: '' }, { status: error.status });
    if (error instanceof z.ZodError) return data({ error: 'Invalid business tool input.', success: '' }, { status: 400 });
    throw error;
  }
}
export function headers() { return { 'Cache-Control': 'no-store' }; }
export function meta() { return [{ title: 'Business tools | OMYQUANT' }, { name: 'robots', content: 'noindex, nofollow' }]; }

const orderTransitions: Record<string, string[]> = { placed: ['accepted', 'cancelled'], accepted: ['fulfilled', 'cancelled'] };
const reservationTransitions: Record<string, string[]> = { requested: ['confirmed', 'rejected'], confirmed: ['picked_up'], picked_up: ['returned'] };
const departureTransitions: Record<string, string[]> = { scheduled: ['departed', 'cancelled'], departed: ['completed'] };
function Field({ name, label, type = 'text', min, step }: { name: string; label: string; type?: string; min?: number; step?: string }) { return <label>{label}<input name={name} type={type} min={min} step={step} required /></label>; }
function Place({ dropoff = false }: { dropoff?: boolean }) { return <><Field name={dropoff ? 'dropoffAddress' : 'address'} label={dropoff ? 'Destination address' : 'Address'} /><Field name={dropoff ? 'dropoffProvince' : 'province'} label={dropoff ? 'Destination province' : 'Province'} /></>; }
export default function BusinessTools({ loaderData: loaded, actionData }: Route.ComponentProps) {
  const pending = useNavigation().state !== 'idle';
  const tool = loaded.tool;
  const listing = ['products', 'livestock', 'trailers'].includes(tool);
  const create = listing || ['vehicles', 'routes', 'departures'].includes(tool);
  const pageLink = (page: number) => `?${new URLSearchParams({ tool, page: String(page) })}`;
  return <Shell><div className="form-page"><Link className="text-button" to="/business">Back to My business</Link><h1>{loaded.business.name}</h1><p className="muted">Verified business tools. Access follows your membership and the services this business offers.</p>
    <nav className="category-tabs" aria-label="Business services">{loaded.available.map(key => <Link key={key} className={`tab ${key === tool ? 'active' : ''}`} aria-current={key === tool ? 'page' : undefined} to={`?tool=${key}`}>{businessToolLabels[key]}</Link>)}</nav>
    {actionData?.error && <p role="alert" className="notice error">{actionData.error}</p>}{actionData?.success && <p role="status" className="notice">{actionData.success}</p>}
    <section className="form-panel"><h2>{businessToolLabels[tool]} ({loaded.total})</h2>
      {tool === 'reservations' && <p className="muted">Requested: awaiting approval. Confirmed: reserved. Picked up: currently rented. Confirming checks for overlapping reservations.</p>}
      {!loaded.records.length && <p className="muted">No records yet.</p>}
      {loaded.records.map(record => {
        const transitions = tool === 'orders' ? orderTransitions[record.status ?? ''] ?? [] : tool === 'reservations' ? reservationTransitions[record.status ?? ''] ?? [] : tool === 'departures' ? departureTransitions[record.status ?? ''] ?? [] : tool === 'products' || tool === 'livestock' ? ['draft', 'published', 'inactive'].filter(status => status !== record.status) : tool === 'trailers' ? [record.active ? 'inactive' : 'active'] : [];
        return <article className="activity-card" key={record._id}><h3>{record.name ?? record.registration ?? `Reference: ${record._id}`}</h3><p className="muted">{record.status ?? (record.active === undefined ? '' : record.active ? 'Active' : 'Inactive')}</p>
          {record.items?.map((item, index) => <p key={index}>{item.quantity} × {item.name}</p>)}
          {record.quantity !== undefined && <p>Stock: {record.quantity}</p>}{record.seats !== undefined && <p>Seats booked: {record.seats}</p>}{record.remaining !== undefined && <p>Seats available: {taxiSeatsAvailable(record.capacity ?? TAXI_PASSENGER_CAPACITY, record.remaining)} / {Math.min(record.capacity ?? TAXI_PASSENGER_CAPACITY, TAXI_PASSENGER_CAPACITY)}</p>}
          {(record.dailyPrice ?? record.price ?? record.total) !== undefined && <p>{zar(record.dailyPrice ?? record.price ?? record.total ?? 0)}{tool === 'trailers' ? ' / day' : ''}</p>}
          {record.start && <p>{new Date(record.start).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} to {new Date(record.end!).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>}
          {record.startsAt && <p>{new Date(record.startsAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>}
          {record.trailer && <p className="muted">Trailer: {record.trailer}</p>}{record.departure && <p className="muted">Departure: {record.departure}</p>}
          {transitions.length > 0 && <Form method="post"><input type="hidden" name="tool" value={tool} /><input type="hidden" name="record" value={record._id} /><input type="hidden" name="intent" value="status" /><label>Next status<select name="status">{transitions.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label><button className="button small" disabled={pending}>Update status</button></Form>}
        </article>;
      })}
      {loaded.page > 1 && <Link className="button outline small" to={pageLink(loaded.page - 1)}>Previous</Link>}{loaded.page * loaded.limit < loaded.total && <Link className="button outline small" to={pageLink(loaded.page + 1)}>Next</Link>}
    </section>
    {create && <Form key={tool} method="post" encType="multipart/form-data" className="form-panel"><h2>Add {tool === 'livestock' ? 'livestock' : tool === 'products' ? 'product' : tool === 'trailers' ? 'trailer' : tool === 'vehicles' ? 'vehicle' : tool === 'routes' ? 'route' : 'departure'}</h2><input type="hidden" name="tool" value={tool} /><input type="hidden" name="intent" value="create" />
      <div className="form-grid">
        {(listing || tool === 'routes') && <Field name="name" label="Name" />}
        {(tool === 'products' || tool === 'livestock') && <><Field name="description" label="Description" /><Field name="quantity" label="Quantity available" type="number" min={0} step="1" /><label>Listing status<select name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label></>}
        {(listing || tool === 'departures') && <Field name="price" label={tool === 'trailers' ? 'Daily price (R)' : 'Price (R)'} type="number" min={0} step="0.01" />}
        {tool === 'products' && <><Field name="unit" label="Unit (kg, bag, box)" /><label>Category<select name="category">{['produce', 'feed', 'hay_straw', 'equipment', 'supplies', 'other'].map(value => <option key={value}>{value}</option>)}</select></label></>}
        {tool === 'livestock' && <><Field name="animalCategory" label="Animal (cattle, sheep, chicken, goat)" /><Field name="breed" label="Breed" /><Field name="ageMonths" label="Age in months" type="number" min={0} step="1" /><label>Sex<select name="sex">{['unknown', 'male', 'female', 'mixed'].map(value => <option key={value}>{value}</option>)}</select></label></>}
        {tool === 'trailers' && <><Field name="trailerType" label="Trailer type" /><Field name="payloadKg" label="Payload (kg)" type="number" min={0.01} step="any" />{['length', 'width', 'height'].map(name => <Field key={name} name={name} label={`${name} (metres)`} type="number" min={0.01} step="any" />)}</>}
        {(listing || tool === 'routes') && <Place />}
        {tool === 'routes' && <><Place dropoff /><label>Route type<select name="mode"><option value="long_distance">Long distance</option><option value="local">Local</option></select></label></>}
        {tool === 'vehicles' && <><Field name="registration" label="Vehicle registration" /><label>Passenger seats (excluding driver)<input name="capacity" type="number" min={1} max={TAXI_PASSENGER_CAPACITY} defaultValue={TAXI_PASSENGER_CAPACITY} step="1" required /><span className="muted">Up to 15 passengers per taxi. Use fewer seats if the vehicle has a lower capacity.</span></label></>}
        {tool === 'departures' && <><label>Vehicle<select name="vehicle" required><option value="">Select vehicle</option>{loaded.vehicles.map(vehicle => <option key={vehicle._id} value={vehicle._id}>{vehicle.registration}</option>)}</select></label><label>Route<select name="route" required><option value="">Select route</option>{loaded.routes.map(route => <option key={route._id} value={route._id}>{route.name}</option>)}</select></label><Field name="startsAt" label="Departure time (South African time)" type="datetime-local" /></>}
      </div>
      {listing && <label>Image (optional, up to 5 MiB)<input type="file" name="imageFile" accept="image/png,image/jpeg,image/gif,image/webp" /></label>}
      {tool === 'departures' && (!loaded.vehicles.length || !loaded.routes.length) && <p className="notice">Add a vehicle and route before scheduling a departure.</p>}
      <button className="button full" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </Form>}
  </div></Shell>;
}
