import { z } from "zod";

const ttl = 30;
const entry = z.object({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100), expiresAt: z.number() }).strict();
type Configuration = { url: string; token: string; namespace: string };

export function redisConfiguration(): Configuration | undefined {
  if (process.env.REDIS_CACHE_ENABLED !== "true") return;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const endpoint = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (!token || !endpoint) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") ||
        url.username || url.password || url.search || url.hash || url.port || url.pathname !== "/") return;
    const namespace = process.env.REDIS_CACHE_NAMESPACE?.trim() || "omyquant:catalog:v1";
    if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace)) return;
    return { url: url.origin, token, namespace };
  } catch { return; }
}

export function createRedisCache(config: Configuration, fetcher: typeof fetch = fetch) {
  let retryAfter = 0;
  async function command(args: (string | number)[]) {
    if (Date.now() < retryAfter) return;
    try {
      const response = await fetcher(config.url, {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args), signal: AbortSignal.timeout(500),
      });
      if (!response.ok) throw new Error("Redis unavailable");
      const text = await response.text();
      if (text.length > 16384) throw new Error("Redis response too large");
      const envelope = JSON.parse(text) as { result?: unknown; error?: unknown };
      if (!envelope || envelope.error || !("result" in envelope)) throw new Error("Redis command failed");
      return { result: envelope.result };
    } catch {
      retryAfter = Date.now() + 30000;
      // Never log the REST token, endpoint, request data or provider error text.
      console.warn("Redis cache unavailable; using MongoDB directly for 30 seconds.");
    }
  }
  return {
    namespace: config.namespace,
    async read(key: string): Promise<string[] | null | undefined> {
      const response = await command(["GET", `${config.namespace}:${key}`]);
      if (!response) return undefined;
      if (response.result === null) return null;
      try {
        const parsed = entry.parse(JSON.parse(String(response.result)));
        return parsed.expiresAt > Date.now() ? parsed.ids : null;
      } catch { return null; }
    },
    async write(key: string, ids: string[]) {
      const parsed = entry.safeParse({ ids, expiresAt: Date.now() + ttl * 1000 });
      if (!parsed.success) return;
      await command(["SET", `${config.namespace}:${key}`, JSON.stringify(parsed.data), "EX", ttl]);
    },
  };
}

let current: { signature: string; cache: ReturnType<typeof createRedisCache> } | undefined;
export function redisCatalogCache() {
  const config = redisConfiguration();
  if (!config) return;
  const signature = JSON.stringify(config);
  if (current?.signature !== signature) current = { signature, cache: createRedisCache(config) };
  return current.cache;
}
