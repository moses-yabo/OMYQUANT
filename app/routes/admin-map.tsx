import { data } from 'react-router';
import type { Route } from './+types/admin-map';
import { requireAdminPage } from '../.server/admin-access';
import { businessMapData } from '../.server/modules/business-map';
import { Shell } from '../components/shell';
import { BusinessMap } from '../components/business-map';
export async function loader({ request }: Route.LoaderArgs) {
  return data(await businessMapData(await requireAdminPage(request)), { headers: { 'Cache-Control': 'no-store' } });
}
export function meta() { return [{ title: 'Business map | OMYQUANT administration' }, { name: 'robots', content: 'noindex, nofollow' }]; }
export default function AdminMap({ loaderData }: Route.ComponentProps) {
  return <Shell><div className="form-page"><span className="eyebrow">ADMINISTRATION · LOCATION INTELLIGENCE</span><h1>Registered business map</h1><p className="muted">See your platform footprint, identify missing location data and review providers by region.</p><BusinessMap businesses={loaderData.businesses} total={loaderData.total} /></div></Shell>;
}
