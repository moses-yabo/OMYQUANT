import { createHash } from "node:crypto";
import type mongoose from "mongoose";
import { page } from "../shared/http";
import { applyListFilters, headers, list } from "../api/http";
import { redisCatalogCache } from "./redis";

const cachedPaths = new Set(["farming/products", "farming/livestock", "rentals/trailers"]);

export async function publicCatalogList(path: string, model: mongoose.Model<any>, filter: Record<string, unknown>, url: URL) {
  const cache = cachedPaths.has(path) && !url.searchParams.has("business") ? redisCatalogCache() : undefined;
  if (!cache) return list(model, filter, url);
  const { page: current, limit } = page.parse(Object.fromEntries(url.searchParams));
  const business = filter.business as { $in: unknown[] };
  const key = createHash("sha256").update(JSON.stringify({
    database: process.env.MONGODB_URI, name: process.env.MONGODB_DB_NAME, origin: process.env.APP_ORIGIN,
    path, current, limit, q: url.searchParams.get("q")?.trim().slice(0, 100) || "",
    province: url.searchParams.get("province") || "",
    sort: ["low", "high"].includes(url.searchParams.get("sort") ?? "") ? url.searchParams.get("sort") : "recent",
    // Eligibility is queried from MongoDB before every lookup, including a hit.
    businesses: business.$in.map(String).sort(),
  })).digest("hex");
  const ids = await cache.read(key);
  if (ids) {
    applyListFilters(filter, url);
    // Reapply live publication, active-provider and business filters. Redis
    // never supplies record content, authorization or inventory availability.
    const records = await model.find({ ...filter, _id: { $in: ids } }).lean();
    const byId = new Map(records.map(record => [String(record._id), record]));
    return Response.json({ data: ids.flatMap(id => byId.has(id) ? [byId.get(id)] : []), pagination: { page: current, limit } }, { headers });
  }
  const response = await list(model, filter, url);
  if (ids === null) {
    const payload = await response.clone().json() as { data: { _id: string }[] };
    await cache.write(key, payload.data.map(record => String(record._id)));
  }
  return response;
}
