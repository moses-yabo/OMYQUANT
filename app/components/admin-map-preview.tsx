import { Link } from 'react-router';
export function AdminMapPreview() {
  return <section className="form-panel"><span className="eyebrow">YOUR PLATFORM, ON THE MAP</span><h2>Explore registered businesses</h2><p className="muted">Open the interactive map to spot providers by region, filter verification statuses and find businesses that still need a location pin.</p><Link className="button" to="/admin/map">Open business map →</Link></section>;
}
