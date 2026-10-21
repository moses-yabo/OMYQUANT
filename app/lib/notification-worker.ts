// Compiled by Vite via ?worker&url; no cache or fetch interception is installed.
export {};
type WindowClient = { url: string; focus(): Promise<unknown>; navigate(url: string): Promise<unknown> };
type WorkerEvent = { waitUntil(promise: Promise<unknown>): void };
type ClickEvent = WorkerEvent & { notification: { close(): void; data?: { url?: unknown } } };
const worker = globalThis as unknown as {
  location: { origin: string };
  skipWaiting(): Promise<void>;
  clients: { matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClient[]>; openWindow(url: string): Promise<unknown> };
  addEventListener(type: 'install', listener: (event: WorkerEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: ClickEvent) => void): void;
};
worker.addEventListener('install', event => event.waitUntil(worker.skipWaiting()));
worker.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data?.url;
  const path = typeof requested === 'string' && ['/account#orders', '/account#bookings', '/account#reservations'].includes(requested) ? requested : '/account';
  const url = new URL(path, worker.location.origin).href;
  event.waitUntil((async () => {
    const windows = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === worker.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await worker.clients.openWindow(url);
  })());
});
