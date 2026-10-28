// Cache only this public connection page. Never cache authenticated HTML or data.
const offlineCache = "omyquant-offline-v1";
const offlinePage = "/offline.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(offlineCache).then(cache => cache.add(offlinePage)));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("omyquant-offline-") && name !== offlineCache).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin ||
      /^\/(?:api|auth|media|business\/documents)(?:\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(offlineCache);
    return await cache.match(offlinePage) ?? new Response("You are offline. Reconnect and reload OMYQUANT.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }));
});
