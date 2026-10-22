import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { CircleMarker, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './business-map.css';
import { businessPins, filterMapBusinesses, mapStatus, mapStatusColors, type BusinessMapRecord, type BusinessPin } from '../lib/business-map';
import { serviceTypes, verificationStatuses } from '../lib/business-registry';

export function BusinessMap({ businesses, total = businesses.length }: { businesses: BusinessMapRecord[]; total?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all');
  const [type, setType] = useState('all'); const [province, setProvince] = useState('all');
  const [page, setPage] = useState(0); const [error, setError] = useState(''); const [ready, setReady] = useState(false);
  const filtered = useMemo(() => filterMapBusinesses(businesses, { query, status, type, province }), [businesses, query, status, type, province]);
  const pins = useMemo(() => businessPins(filtered).filter(pin => province === 'all' || pin.location.province === province), [filtered, province]);
  const pinnedBusinesses = new Set(pins.map(pin => pin.business._id));
  const provinces = [...new Set(businesses.flatMap(business => business.locations.map(location => location.province).filter((value): value is string => Boolean(value))))].sort();
  useEffect(() => {
    let stopped = false; let instance: LeafletMap | undefined; let observer: ResizeObserver | undefined;
    setReady(false); setError('');
    void import('leaflet').then(L => {
      if (stopped || !container.current) return;
      instance = L.map(container.current, { preferCanvas: true, scrollWheelZoom: false }).setView([-29, 25], 5);
      map.current = instance;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
      tiles.on('tileerror', () => { if (!stopped) setError('Some map tiles could not load. Saved locations and the business list remain available.'); });
      const groups = new Map<string, BusinessPin[]>();
      for (const pin of pins) { const key = `${pin.latitude},${pin.longitude}`; groups.set(key, [...(groups.get(key) ?? []), pin]); }
      for (const group of groups.values()) {
        const pin = group[0]; const states = new Set(group.map(item => mapStatus(item.business)));
        const approximate = group.some(item => item.location.geocoding && !['building', 'amenity'].includes(item.location.geocoding.precision ?? 'unknown'));
        const marker = L.circleMarker([pin.latitude, pin.longitude], { radius: Math.min(18, 8 + Math.log2(group.length) * 3), color: '#fff', weight: 2, fillColor: states.size === 1 ? mapStatusColors[mapStatus(pin.business)] : '#367e93', fillOpacity: approximate ? .35 : .9, ...(approximate ? { dashArray: '3 3' } : {}) }).addTo(instance);
        const popup = document.createElement('div');
        const heading = document.createElement('strong'); heading.textContent = group.length === 1 ? 'Registered business location' : `${group.length} locations share this pin`; popup.append(heading);
        for (const item of group) {
          const row = document.createElement('p'); const link = document.createElement('a');
          link.href = `/admin/businesses/${encodeURIComponent(item.business._id)}#business-location`; link.textContent = item.business.name;
          row.append(link, document.createElement('br'), document.createTextNode(`${mapStatus(item.business).replaceAll('_', ' ')} · ${item.business.types.join(', ')} · ${item.location.address ?? item.location.province ?? ''}${item.location.geocoding ? ` · Address match: ${item.location.geocoding.precision ?? 'unknown'}${item.location.geocoding.reviewed ? ' (reviewer confirmed)' : ' (automatic match)'}` : ' · Supplied coordinates'}`));
          popup.append(row); markers.current.set(item.key, marker);
        }
        marker.bindPopup(popup, { maxHeight: 240, maxWidth: 300 });
        const tooltip = document.createElement('span'); tooltip.textContent = group.length === 1 ? pin.business.name : `${group.length} business locations`;
        marker.bindTooltip(tooltip);
      }
      if (pins.length) instance.fitBounds(L.latLngBounds(pins.map(pin => [pin.latitude, pin.longitude])), { padding: [36, 36], maxZoom: 13 });
      if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => instance?.invalidateSize()); observer.observe(container.current); }
      setReady(true);
    }).catch(() => { if (!stopped) setError('The interactive map could not load. You can still review businesses using the list.'); });
    return () => { stopped = true; observer?.disconnect(); instance?.remove(); map.current = null; markers.current.clear(); };
  }, [pins]);
  function focus(id: string) {
    const pin = pins.find(item => item.business._id === id);
    if (pin) { map.current?.setView([pin.latitude, pin.longitude], 14); markers.current.get(pin.key)?.openPopup(); }
  }
  const selectedPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 20) - 1));
  return <section className="business-map-section" aria-label="Registered business map">
    <div className="business-map-heading"><div><span className="eyebrow">PLATFORM FOOTPRINT</span><h2>Where our businesses operate</h2><p className="muted">Explore registered locations and jump straight into a review.</p></div><span className="status-pill">{pinnedBusinesses.size} / {filtered.length} businesses pinned</span></div>
    <div className="business-map-filters">
      <label>Search businesses<input type="search" value={query} placeholder="Business, address or province" onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="all">All statuses</option>{[...verificationStatuses, 'INACTIVE'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Service<select value={type} onChange={event => { setType(event.target.value); setPage(0); }}><option value="all">All services</option>{serviceTypes.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Province<select value={province} onChange={event => { setProvince(event.target.value); setPage(0); }}><option value="all">All provinces</option>{provinces.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="business-map-legend">{Object.entries(mapStatusColors).map(([value, color]) => <span key={value}><i style={{ background: color }} />{value.replaceAll('_', ' ')}</span>)}<span>Faint / dashed pins: approximate address matches</span><span>Address matching: <a className="text-button" href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a></span></div>
    {total > businesses.length && <p className="notice">Showing the newest {businesses.length} of {total} businesses. Use the verification queue to find older records.</p>}
    {error && <p className="notice" role="status">{error}</p>}
    <div className="business-map-layout">
      <div><div ref={container} className="business-map-canvas" role="region" aria-label="Interactive business locations map" />{!ready && !error && <p className="muted" role="status">Loading interactive map…</p>}<p className="business-map-note">Saved coordinates only. No coordinates means no pin; a town name is not a precise business location. Larger markers group locations sharing the same coordinates.</p><a className="text-button" href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Report a basemap issue</a></div>
      <div className="business-map-directory"><h3>{filtered.length} businesses · {filtered.length - pinnedBusinesses.size} need a location</h3>{!filtered.length && <p className="muted">No businesses match these filters.</p>}{filtered.slice(selectedPage * 20, selectedPage * 20 + 20).map(business => <article className="business-map-card" key={business._id}><strong>{business.name}</strong><span className="muted">{mapStatus(business).replaceAll('_', ' ')} · {business.types.join(', ').replaceAll('_', ' ')}</span><span>{business.locations.map(location => location.province).filter(Boolean).join(' · ') || 'No location recorded'}</span><div>{pinnedBusinesses.has(business._id) ? <button type="button" className="text-button" onClick={() => focus(business._id)}>Locate on map</button> : <span className="muted">Needs coordinates</span>}<Link className="text-button" to={`/admin/businesses/${business._id}#business-location`}>Review / set pin</Link></div></article>)}<div className="business-map-pagination"><button className="button outline small" disabled={selectedPage === 0} onClick={() => setPage(selectedPage - 1)}>Previous</button><span>{selectedPage + 1} / {Math.max(1, Math.ceil(filtered.length / 20))}</span><button className="button outline small" disabled={(selectedPage + 1) * 20 >= filtered.length} onClick={() => setPage(selectedPage + 1)}>Next</button></div></div>
    </div>
  </section>;
}
