import { useEffect, useRef, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { connectSupport } from '../lib/support-realtime';

export function SupportLiveUpdates() {
  const revalidator = useRevalidator();
  const latest = useRef(revalidator);
  latest.current = revalidator;
  const [waiting, setWaiting] = useState(false);
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
  return waiting ? <p className="notice" role="status">New support activity. <button type="button" className="text-button" onClick={() => { setWaiting(false); void revalidator.revalidate(); }}>Refresh conversation</button></p> : null;
}
export function SupportActivityNotice() {
  const [activity, setActivity] = useState(false);
  useEffect(() => connectSupport(ticketId => { if (ticketId) setActivity(true); }), []);
  return activity ? <nav className="admin-navigation" aria-label="New support activity"><span role="status">New customer support activity.</span><Link className="button outline small" to="/admin/support" onClick={() => setActivity(false)}>Open support inbox</Link></nav> : null;
}
