import { expect, jest, test } from "@jest/globals";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { routes } from "../build/server/index.js";

function worker() {
  const handlers = {};
  const cache = { add: jest.fn().mockResolvedValue(undefined), match: jest.fn().mockResolvedValue(new Response("Offline information")) };
  const caches = {
    open: jest.fn().mockResolvedValue(cache),
    keys: jest.fn().mockResolvedValue(["omyquant-offline-v0", "omyquant-offline-v1", "unrelated-cache"]),
    delete: jest.fn().mockResolvedValue(true),
  };
  const fetch = jest.fn().mockResolvedValue(new Response("Live content"));
  const self = { location: { origin: "https://example.test" }, clients: { claim: jest.fn().mockResolvedValue(undefined) }, addEventListener: (name, callback) => { handlers[name] = callback; } };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, caches, fetch, URL, Response });
  return { handlers, cache, caches, fetch, self };
}
function navigation(url = "https://example.test/account", method = "GET", mode = "navigate") {
  return { request: { url, method, mode }, respondWith: jest.fn() };
}

test("worker preloads only the public offline page and removes only its own old cache", async () => {
  const state = worker();
  let pending;
  state.handlers.install({ waitUntil(value) { pending = value; } });
  await pending;
  expect(state.cache.add).toHaveBeenCalledTimes(1);
  expect(state.cache.add).toHaveBeenCalledWith("/offline.html");
  state.handlers.activate({ waitUntil(value) { pending = value; } });
  await pending;
  expect(state.caches.delete).toHaveBeenCalledTimes(1);
  expect(state.caches.delete).toHaveBeenCalledWith("omyquant-offline-v0");
  expect(state.self.clients.claim).toHaveBeenCalled();
});

test.each([
  ["/api/v1/users/me", "GET", "navigate"],
  ["/auth/google/callback?code=private", "GET", "navigate"],
  ["/media/images/file", "GET", "navigate"],
  ["/business/documents/file", "GET", "navigate"],
  ["/reserve", "POST", "navigate"],
  ["/account.data", "GET", "cors"],
  ["https://external.test/", "GET", "navigate"],
])("worker leaves sensitive or non-navigation request %s untouched", (path, method, mode) => {
  const state = worker();
  const event = navigation(new URL(path, "https://example.test").href, method, mode);
  state.handlers.fetch(event);
  expect(event.respondWith).not.toHaveBeenCalled();
  expect(state.fetch).not.toHaveBeenCalled();
  expect(state.caches.open).not.toHaveBeenCalled();
});

test("successful and HTTP-error navigations remain live and never enter Cache Storage", async () => {
  const state = worker();
  const response = new Response("Session expired", { status: 401 });
  state.fetch.mockResolvedValue(response);
  const event = navigation();
  state.handlers.fetch(event);
  expect(await event.respondWith.mock.calls[0][0]).toBe(response);
  expect(state.caches.open).not.toHaveBeenCalled();
});

test("network failure returns only the generic offline page and has a 503 fallback if missing", async () => {
  const state = worker();
  state.fetch.mockRejectedValue(new TypeError("Offline"));
  const event = navigation();
  state.handlers.fetch(event);
  expect(await (await event.respondWith.mock.calls[0][0]).text()).toBe("Offline information");
  expect(state.cache.match).toHaveBeenCalledWith("/offline.html");
  state.cache.match.mockResolvedValue(undefined);
  const missing = navigation();
  state.handlers.fetch(missing);
  expect((await missing.respondWith.mock.calls[0][0]).status).toBe(503);
});

test("production manifest, icons and root links support standalone installation", () => {
  const manifest = JSON.parse(readFileSync("build/client/manifest.webmanifest", "utf8"));
  expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", name: "OMYQUANT" });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
    expect(icon).toBeDefined();
    const png = readFileSync(`build/client${icon.src}`);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  expect(routes.root.module.links()).toEqual(expect.arrayContaining([
    expect.objectContaining({ rel: "manifest", href: "/manifest.webmanifest" }),
    expect.objectContaining({ rel: "apple-touch-icon", sizes: "180x180" }),
  ]));
  expect(existsSync("build/client/sw.js")).toBe(true);
  expect(existsSync("build/client/offline.html")).toBe(true);
});
