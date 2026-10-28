// The only stored document is a sanitized public marketplace snapshot.
const offlineCache = "omyquant-offline-v2";
const offlinePage = "/offline.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(offlineCache).then(cache => cache.addAll([offlinePage, "/offline-client.js", "/offline.css"])));
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
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode !== "navigate" && (url.pathname.endsWith(".data") || url.pathname.startsWith("/api/v1/"))) {
    event.respondWith(fetch(request).catch(error => {
      if (event.clientId && url.pathname !== "/api/v1/health") event.waitUntil(self.clients.get(event.clientId).then(client => client?.postMessage({ type: "OMYQUANT_NETWORK_UNAVAILABLE" })).catch(() => {}));
      throw error; // Preserve failure semantics. No data cache or replay.
    }));
    return;
  }
  const publicAsset = ["/offline-client.js", "/offline.css"].includes(url.pathname) ||
    /^\/assets\/[\w-]+\.css$/.test(url.pathname) ||
    (request.destination === "image" && /^\/(?:images\/[\w./-]+|media\/images\/[a-f\d]{24})$/i.test(url.pathname));
  if (publicAsset && !url.search) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(offlineCache);
      return await cache.match(url.pathname) ?? new Response("Unavailable offline", { status: 503 });
    }));
    return;
  }
  if (request.mode !== "navigate" ||
      /^\/(?:api|auth|media|business\/documents)(?:\/|$)/.test(url.pathname)) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(offlineCache);
    if (url.pathname === "/") {
      const snapshot = await cache.match("/offline-marketplace.html");
      const saved = Number(snapshot?.headers.get("X-OMYQUANT-Saved-At"));
      if (snapshot && saved > Date.now() - 86400000 && saved <= Date.now()) return snapshot;
    }
    return await cache.match(offlinePage) ?? new Response("You are offline. Reconnect and reload OMYQUANT.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }));
});
