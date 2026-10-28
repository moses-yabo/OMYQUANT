import type mongoose from "mongoose";
import { ApiError, page } from "../shared/http";
export const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export const json = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json({ data }, { status, headers: { ...headers, ...extra } });
export async function body(request: Request) {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new ApiError(415, "Use application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON body required");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) {
      await reader.cancel();
      throw new ApiError(413, "Request too large");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}
export function applyListFilters(filter: Record<string, unknown>, url: URL) {
  const query = url.searchParams.get("q")?.trim().slice(0, 100);
  if (query)
    filter.name = {
      $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  if (url.searchParams.get("province"))
    filter["location.province"] = url.searchParams.get("province");
}
export async function list(
  model: mongoose.Model<any>,
  filter: Record<string, unknown>,
  url: URL,
) {
  const { page: current, limit } = page.parse(Object.fromEntries(url.searchParams));
  applyListFilters(filter, url);
  const priceField = model.modelName === "Trailer" ? "dailyPrice" : "price";
  const data = await model
    .find(filter)
    .sort(
      url.searchParams.get("sort") === "low"
        ? { [priceField]: 1, _id: -1 }
        : url.searchParams.get("sort") === "high"
          ? { [priceField]: -1, _id: -1 }
          : { _id: -1 },
    )
    .skip((current - 1) * limit)
    .limit(limit)
    .lean();
  return Response.json(
    { data, pagination: { page: current, limit } },
    { headers },
  );
}
