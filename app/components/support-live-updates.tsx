import { useEffect, useRef, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { connectSupport } from '../lib/support-realtime';
import { LoadingIndicator } from './loading';

export function SupportLiveUpdates() {
  const revalidator = useRevalidator();
  const latest = useRef(revalidator);
  latest.current = revalidator;
  const [waiting, setWaiting] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (document.activeElement?.closest('form') || [...document.querySelectorAll<HTMLTextAreaElement>('form textarea')].some(input => input.value.trim())) { setWaiting(true); return; }
      if (latest.current.state === 'idle') void latest.current.revalidate();
    };
    const disconnect = connectSupport(refresh);
    // Refresh after reconnects and across instances without a shared socket adapter.
    const timer = window.setInterval(refresh, 30000);
    return () => { disconnect(); window.clearInterval(timer); };
  }, []);
  return waiting || manual ? <div className="notice">{manual ? <LoadingIndicator label="Refreshing conversation..." compact /> : <><span role="status">New support activity.</span> <button type="button" className="text-button" onClick={async () => { setManual(true); setWaiting(false); try { await revalidator.revalidate(); } finally { setManual(false); } }}>Refresh conversation</button></>}</div> : null;
}
export function SupportActivityNotice() {
  const [activity, setActivity] = useState(false);
  useEffect(() => connectSupport(ticketId => { if (ticketId) setActivity(true); }), []);
  return activity ? <nav className="admin-navigation" aria-label="New support activity"><span role="status">New customer support activity.</span><Link className="button outline small" to="/admin/support" onClick={() => setActivity(false)}>Open support inbox</Link></nav> : null;
}
