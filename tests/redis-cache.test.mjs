import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { createRedisCache, redisConfiguration } from "../app/.server/cache/redis.ts";
import { publicCatalogList } from "../app/.server/cache/public-catalog.ts";

const keys = ["REDIS_CACHE_ENABLED", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "REDIS_CACHE_NAMESPACE"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const config = { url: "https://test-cache.upstash.io", token: "test-token", namespace: "unit:catalog" };
const id = "a".repeat(24);
let sequence = 0;
beforeEach(() => {
  process.env.REDIS_CACHE_ENABLED = "true";
  process.env.UPSTASH_REDIS_REST_URL = config.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = config.token;
  process.env.REDIS_CACHE_NAMESPACE = `unit:catalog:${++sequence}`;
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
const reply = result => Response.json({ result });
const filter = (business = "b".repeat(24)) => ({ status: "published", business: { $in: [business] } });
function model(records) {
  const query = {
    sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(records),
  };
  return { modelName: "Product", find: jest.fn().mockReturnValue(query), query };
}

test("configuration is opt-in, credential-complete and restricted to HTTPS Upstash endpoints", () => {
  expect(redisConfiguration()).toMatchObject({ url: config.url, token: config.token });
  process.env.REDIS_CACHE_ENABLED = "false";
  expect(redisConfiguration()).toBeUndefined();
  process.env.REDIS_CACHE_ENABLED = "true";
  for (const url of ["redis://localhost:6379", "http://test.upstash.io", "https://example.test", "https://user:password@test.upstash.io", "https://test.upstash.io/?token=secret"]) {
    process.env.UPSTASH_REDIS_REST_URL = url;
    expect(redisConfiguration()).toBeUndefined();
  }
  process.env.UPSTASH_REDIS_REST_URL = config.url;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  expect(redisConfiguration()).toBeUndefined();
});

test("Redis stores only validated IDs with explicit expiration and a Redis TTL", async () => {
  const fetcher = jest.fn().mockResolvedValue(reply("OK"));
  const cache = createRedisCache(config, fetcher);
  await cache.write("query-hash", [id]);
  const [endpoint, options] = fetcher.mock.calls[0];
  expect(endpoint).toBe(config.url);
  expect(options.headers.Authorization).toBe("Bearer test-token");
  expect(options.redirect).toBe("error");
  const [command, key, raw, ex, ttl] = JSON.parse(options.body);
  expect([command, key, ex, ttl]).toEqual(["SET", "unit:catalog:query-hash", "EX", 30]);
  expect(JSON.parse(raw)).toMatchObject({ ids: [id], expiresAt: expect.any(Number) });
  await cache.write("invalid", ["not-an-id"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each([null, "invalid JSON", JSON.stringify({ ids: [id], expiresAt: 1 }), JSON.stringify({ ids: ["bad"], expiresAt: Date.now() + 30000 })])("missing, corrupt or expired entries are misses (%#)", async value => {
  const cache = createRedisCache(config, jest.fn().mockResolvedValue(reply(value)));
  expect(await cache.read("key")).toBeNull();
});

test.each(["network", "quota", "command-error"])("%s failure opens a circuit and never exposes provider errors", async kind => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const fetcher = jest.fn();
  if (kind === "network") fetcher.mockRejectedValue(new Error("private provider error"));
  if (kind === "quota") fetcher.mockResolvedValue(new Response("private provider error", { status: 429 }));
  if (kind === "command-error") fetcher.mockResolvedValue(Response.json({ error: "private provider error" }));
  const cache = createRedisCache(config, fetcher);
  expect(await cache.read("key")).toBeUndefined();
  await cache.write("key", [id]);
  expect(await cache.read("key")).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith("Redis cache unavailable; using MongoDB directly for 30 seconds.");
});

test("a hit reads live records, reapplies visibility/search filters and keeps cached ordering", async () => {
  const second = "c".repeat(24);
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => reply(JSON.stringify({ ids: [id, second], expiresAt: Date.now() + 30000 })));
  const db = model([{ _id: second, name: "Fresh price", price: 900 }, { _id: id, quantity: 2 }]);
  const response = await publicCatalogList("farming/products", db, filter(), new URL("https://example.test/api/v1/farming/products?q=apple&province=Gauteng"));
  expect(db.find).toHaveBeenCalledWith(expect.objectContaining({
    status: "published", business: filter().business, _id: { $in: [id, second] },
    name: { $regex: "apple", $options: "i" }, "location.province": "Gauteng",
  }));
  expect(db.query.sort).not.toHaveBeenCalled();
  expect((await response.json()).data).toEqual([{ _id: id, quantity: 2 }, { _id: second, name: "Fresh price", price: 900 }]);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("withdrawn records are omitted even while their IDs remain cached", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => reply(JSON.stringify({ ids: [id], expiresAt: Date.now() + 30000 })));
  const response = await publicCatalogList("farming/products", model([]), filter(), new URL("https://example.test/farming/products"));
  expect((await response.json()).data).toEqual([]);
});

test("misses populate only public IDs and eligibility/page/query changes use different opaque keys", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => reply(JSON.parse(options.body)[0] === "GET" ? null : "OK"));
  const db = model([{ _id: id, name: "Public record", documents: ["not-for-redis"] }]);
  for (const [business, query] of [["b", "?q=apple"], ["c", "?q=apple"], ["b", "?q=apple&page=2"], ["b", "?q=pear"]]) {
    await publicCatalogList("farming/products", db, filter(business.repeat(24)), new URL(`https://example.test/farming/products${query}`));
  }
  const commands = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
  const gets = commands.filter(command => command[0] === "GET");
  expect(new Set(gets.map(command => command[1])).size).toBe(4);
  expect(JSON.stringify(commands)).not.toContain("not-for-redis");
  expect(JSON.stringify(commands)).not.toContain("apple");
});

test.each(["transport/departures", "transport/drivers", "farming/orders", "users/me"])("%s bypasses Redis", async path => {
  const fetcher = jest.spyOn(globalThis, "fetch");
  await publicCatalogList(path, model([]), filter(), new URL("https://example.test/"));
  expect(fetcher).not.toHaveBeenCalled();
});

test("managed business lists and disabled caches retain direct database behavior", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch");
  await publicCatalogList("farming/products", model([]), filter(), new URL("https://example.test/?business=" + id));
  process.env.REDIS_CACHE_ENABLED = "false";
  await publicCatalogList("farming/products", model([]), filter(), new URL("https://example.test/"));
  expect(fetcher).not.toHaveBeenCalled();
});

test("Redis outage falls back to live MongoDB and failed reads do not attempt writes", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const fetcher = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));
  const response = await publicCatalogList("farming/products", model([{ _id: id, quantity: 4 }]), filter(), new URL("https://example.test/"));
  expect((await response.json()).data[0].quantity).toBe(4);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
