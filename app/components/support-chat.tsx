import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { complaintCategories, complaintStatuses } from '../lib/support';
import { connectSupport } from '../lib/support-realtime';
import './support-chat.css';

type Ticket = { _id: string; subject: string; description: string; status: keyof typeof complaintStatuses; version: number; reporter?: { name?: string }; history: { _id: string; text: string; createdAt: string; author?: { _id?: string; name?: string }; internal?: boolean }[] };
async function supportRequest<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/support${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.issues?.map((issue: { message: string }) => issue.message).join('; ') || payload.error?.message || 'Support is unavailable. Please try again.');
  return payload.data as T;
}
export function SupportChat({ accountId }: { accountId?: string }) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<Pick<Ticket, '_id' | 'subject' | 'status'>[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<keyof typeof complaintCategories>('other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const current = useRef(ticket);
  current.current = ticket;
  const requestCounter = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++requestCounter.current;
    try {
      const selected = current.current?._id;
      const [queue, detail] = await Promise.all([supportRequest<{ tickets: Pick<Ticket, '_id' | 'subject' | 'status'>[] }>('?status=all&limit=20'), selected ? supportRequest<Ticket>(`/${selected}`) : null]);
      if (sequence !== requestCounter.current) return;
      setTickets(queue.tickets);
      if (detail) setTicket(detail);
    } catch (failure) { if (sequence === requestCounter.current) setError(failure instanceof Error ? failure.message : 'Support is unavailable.'); }
  }, []);
  useEffect(() => {
    if (!open || !accountId) return;
    void refresh();
    const disconnect = connectSupport(() => { if (document.visibilityState === 'visible') void refresh(); }, setConnected);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    panel.current?.focus();
    return () => { disconnect(); window.clearInterval(timer); requestCounter.current++; };
  }, [open, accountId, refresh]);
  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight }); }, [ticket?._id, ticket?.history.length]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function select(id: string) {
    ++requestCounter.current;
    setBusy(true); setError('');
    try { const selected = await supportRequest<Ticket>(`/${id}`); current.current = selected; setTicket(selected); setCreating(false); setMessage(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to open conversation.'); }
    finally { setBusy(false); }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !message.trim()) return;
    setBusy(true); setError(''); ++requestCounter.current;
    try {
      const response = ticket ? await supportRequest<{ _id: string }>(`/${ticket._id}`, 'PATCH', { message: message.trim(), version: ticket.version }) : await supportRequest<{ _id: string }>('', 'POST', { channel: 'chat', category, subject: `Chat: ${message.trim().slice(0, 150)}`, description: message.trim() });
      const updated = await supportRequest<Ticket>(`/${response._id}`);
      current.current = updated; setTicket(updated); setCreating(false); setMessage('');
      void refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Message could not be sent.'); void refresh(); }
    finally { setBusy(false); }
  }
  return <div className="support-chat">
    <button ref={launcher} className="support-chat-launcher" type="button" aria-expanded={open} aria-controls="support-chat-panel" onClick={() => open ? close() : setOpen(true)}>Chat with support</button>
    {open && <section id="support-chat-panel" ref={panel} tabIndex={-1} role="dialog" aria-labelledby="support-chat-title" className="support-chat-panel" onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <header><div><h2 id="support-chat-title">OMYQUANT support</h2><p>{connected ? 'Connected · replies appear here' : 'Messages are saved · checking for replies'}</p></div><button type="button" aria-label="Close support chat" onClick={close}>×</button></header>
      <div className="support-chat-body">
        {!accountId ? <><p className="muted">Sign in to send a message to our support team and keep your conversation private.</p><Link className="button full" to="/login" onClick={close}>Sign in to chat</Link></> : <>
        {error && <p role="alert" className="notice error">{error}</p>}
        {ticket ? <><button className="text-button" type="button" disabled={busy} onClick={() => { ++requestCounter.current; current.current = null; setTicket(null); setMessage(''); void refresh(); }}>All conversations</button><p className="muted">{complaintStatuses[ticket.status]} · Ref: {ticket._id.slice(-8).toUpperCase()}</p><div className="support-chat-messages" ref={conversation} role="log" aria-label="Support conversation" aria-live="polite"><p className="support-chat-message mine">{ticket.description}</p>{ticket.history.map(entry => <article className={`support-chat-message ${entry.author?._id === accountId ? 'mine' : ''}`} key={entry._id}><small>{entry.author?.name ?? 'Support'} · {new Date(entry.createdAt).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}</small><p>{entry.text}</p></article>)}</div></> : creating ? <><p className="muted">Tell us what happened. Your message goes to the support team.</p><label>Topic<select value={category} onChange={event => setCategory(event.target.value as keyof typeof complaintCategories)}>{Object.entries(complaintCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : <><p className="muted">Messages go to our administrators. A reply may take time.</p><button className="button full" type="button" onClick={() => { ++requestCounter.current; current.current = null; setTicket(null); setCreating(true); setMessage(''); }}>Start a conversation</button>{!tickets.length && <p className="muted">No conversations yet.</p>}{tickets.map(item => <button className="support-chat-ticket" key={item._id} type="button" disabled={busy} onClick={() => void select(item._id)}><strong>{item.subject}</strong><span>{complaintStatuses[item.status]}</span></button>)}</>}
        {(ticket || creating) && <form onSubmit={send}><label>Your message<textarea name="message" value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} required rows={3} disabled={busy} /></label><button className="button full" disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send message'}</button></form>}
        <Link className="text-button" to={ticket ? `/support/${ticket._id}` : '/support'} onClick={close}>Open full support page</Link>
        </>}
      </div>
    </section>}
  </div>;
}
