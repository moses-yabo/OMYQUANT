import { LoadingIndicator } from './loading';
import { useFetcher } from 'react-router';
import { useFetcherSubmission } from './submission-feedback';
import type { AddressMatch } from '../.server/modules/geocoding';
import './address-lookup.css';
type Lookup = { data?: { matches: AddressMatch[]; address: string; province: string; index: number }; error?: { message: string } };
export function AddressLookup({ business, index }: { business: string; index: number }) {
  const lookup = useFetcher<Lookup>();
  const save = useFetcher<{ data?: { latitude: number; longitude: number }; error?: { message: string } }>();
  const action = `/api/v1/admin/businesses/${business}/geocode`;
  const found = lookup.data?.data;
  const beginLookup = useFetcherSubmission(lookup.state, lookup.data, undefined, lookup.data?.error ? lookup.data : found ? { success: found.matches.length ? 'Address matches found. Check the suggested location before confirming.' : 'No address match found. Check the full address or set the pin manually.' } : undefined);
  const beginSave = useFetcherSubmission(save.state, save.data, undefined, save.data?.error ? save.data : save.data?.data ? { success: 'Location saved and available on the business map.' } : undefined);
  return <div className="address-lookup">
    <p className="muted">Convert this registered address into a map location using Geoapify. Check the match before saving; a street or town match is approximate.</p>
    <button type="button" className="button small" disabled={lookup.state !== 'idle' || save.state !== 'idle'} onClick={() => { if (!beginLookup()) return; void lookup.submit({ index }, { method: 'POST', action, encType: 'application/json' }); }}>{lookup.state !== 'idle' ? 'Finding address…' : 'Find this address on the map'}</button>
    {(lookup.state !== 'idle' || save.state !== 'idle') && <LoadingIndicator label={lookup.state !== 'idle' ? 'Finding address...' : 'Saving location...'} compact />}
    {(lookup.data?.error || save.data?.error) && <p className="notice error" role="alert">{lookup.data?.error?.message ?? save.data?.error?.message}</p>}
    {found && <><p className="muted">{found.matches.length ? 'Choose the location that matches the business premises.' : 'No match found. Check the street number, suburb, town and province, or use a manually checked pin.'}</p>{found.matches.map(match => <article className="activity-card" key={match.id}><strong>{match.label}</strong><p className="muted">Match level: {match.precision} · Confidence: {Math.round(match.confidence * 100)}% · {match.latitude}, {match.longitude}</p><button type="button" className="button outline small" disabled={save.state !== 'idle'} onClick={() => { if (!beginSave()) return; void save.submit({ index, candidate: match.id, address: found.address, province: found.province }, { method: 'PATCH', action, encType: 'application/json' }); }}>{save.state !== 'idle' ? 'Submitting...' : 'Confirm this location'}</button></article>)}</>}
    {save.data?.data && <p className="notice" role="status">Location saved in MongoDB and available on the business map.</p>}
    <p className="business-map-note">Address search: <a className="text-button" href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a>, using OpenStreetMap and other data sources. <a className="text-button" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>.</p>
  </div>;
}
