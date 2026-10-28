import { themeBootstrap } from "./theme";

export const offlineCacheName = "omyquant-offline-v2";
const maxBytes = 32 * 1024 * 1024;
const allowedImage = /^\/(?:images\/[\w./-]+|media\/images\/[a-f\d]{24})$/i;

export async function savePublicMarketplace() {
  if (!window.isSecureContext || !navigator.onLine || !("caches" in window)) return;
  // Store only the unfiltered public marketplace, never Shell/user/navigation,
  // saved finds, dialogs, account pages, search terms or form state.
  if (location.pathname !== "/" || location.search) return;
  const page = document.querySelector<HTMLElement>(".marketplace-page");
  if (!page || page.querySelector('[role="alert"]')) return;
  const clone = page.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script,iframe,object,embed,.save-button,.loading-image-overlay").forEach(node => node.remove());
  clone.querySelectorAll("*").forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith("on")) node.removeAttribute(attribute.name);
    }
  });
  clone.querySelectorAll("input").forEach(input => input.setAttribute("value", ""));
  const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .map(link => new URL(link.href)).filter(url => url.origin === location.origin && /^\/assets\/[\w-]+\.css$/.test(url.pathname))
    .map(url => url.pathname);
  // The offline copy is static HTML: no hydration payload, sessions or app JS.
  const html = `<!doctype html><html lang="en-ZA" data-offline-snapshot="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OMYQUANT | Offline marketplace</title><script>${themeBootstrap}</script>${styles.map(url => `<link rel="stylesheet" href="${url}">`).join("")}<link rel="stylesheet" href="/offline.css"><script src="/offline-client.js" defer></script></head><body><header class="offline-snapshot-banner"><strong>OMYQUANT · Offline copy</strong><span>Saved ${new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}. Prices and availability may have changed.</span><button type="button" data-offline-reload>Reconnect and reload</button></header><main id="main-content">${clone.outerHTML}</main></body></html>`;
  const cache = await caches.open(offlineCacheName);
  let used = 0;
  async function store(url: string, required = false) {
    try {
      const response = await fetch(url, { credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Unavailable asset");
      const type = response.headers.get("Content-Type") ?? "";
      if (!/^(image\/|text\/css|(?:text|application)\/javascript)/.test(type)) throw new Error("Unexpected asset");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 2 * 1024 * 1024 || used + bytes.byteLength > maxBytes) throw new Error("Offline asset limit");
      used += bytes.byteLength;
      await cache.put(url, new Response(bytes, { headers: { "Content-Type": type } }));
    } catch (error) { if (required) throw error; }
  }
  await store("/offline-client.js", true);
  await store("/offline.css", true);
  for (const url of styles) await store(url, true);
  const images = [...new Set([...clone.querySelectorAll("img")].map(image => new URL(image.src, location.origin))
    .filter(url => url.origin === location.origin && !url.search && allowedImage.test(url.pathname)).map(url => url.pathname))].slice(0, 80);
  for (let index = 0; index < images.length; index += 4) await Promise.all(images.slice(index, index + 4).map(url => store(url)));
  // Commit the document last so a partial/failed download retains the old copy.
  await cache.put("/offline-marketplace.html", new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "X-OMYQUANT-Saved-At": String(Date.now()),
  } }));
  const keep = new Set(["/offline.html", "/offline-client.js", "/offline.css", "/offline-marketplace.html", ...styles, ...images]);
  for (const request of await cache.keys()) if (!keep.has(new URL(request.url).pathname)) await cache.delete(request);
}
