import { z } from "zod";
import { LoginAttempt } from "../database/models";
import { digest } from "./auth/auth";
import { ApiError } from "../shared/http";

export type AddressMatch = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  precision: string;
  confidence: number;
};
const cache = new Map<string, { expires: number; matches: AddressMatch[] }>();
const pending = new Map<string, Promise<AddressMatch[]>>();
export function clearGeocodingCache() {
  cache.clear();
  pending.clear();
}
export function geocodingEnabled() {
  return Boolean(process.env.GEOAPIFY_API_KEY?.trim());
}
const providerResult = z.object({
  results: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        formatted: z.string().max(2000),
        place_id: z.string().optional(),
        result_type: z.string().default("unknown"),
        country_code: z.string(),
        rank: z
          .object({ confidence: z.number().min(0).max(1).optional() })
          .optional(),
      }),
    )
    .max(5),
});
export async function geocodeAddress(
  address: string,
  province: string,
  actor: string,
): Promise<AddressMatch[]> {
  const key = process.env.GEOAPIFY_API_KEY?.trim();
  if (!key)
    throw new ApiError(
      503,
      "Address lookup is not configured. Set GEOAPIFY_API_KEY on the server.",
    );
  const text = `${address.trim()}, ${province.trim()}, South Africa`;
  if (!address.trim() || text.length > 2200)
    throw new ApiError(400, "Provide a physical business address and province");
  const cacheKey = digest(text.toLowerCase());
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.matches;
  const attempt = await LoginAttempt.findOneAndUpdate(
    { key: `geocoding:${digest(actor)}:${Math.floor(Date.now() / 900000)}` },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
    },
    { upsert: true, new: true },
  );
  if (Number(attempt.count) > 20)
    throw new ApiError(429, "Too many address lookups. Try again later.");
  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;
  if (pending.size >= 3)
    throw new ApiError(429, "Address lookup is busy. Try again shortly.");
  const task = (async () => {
    const url = new URL("https://api.geoapify.com/v1/geocode/search");
    url.search = new URLSearchParams({
      text,
      filter: "countrycode:za",
      format: "json",
      limit: "5",
      apiKey: key,
    }).toString();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) {
        // Never log the request URL, response body or credentials.
        console.warn("Geocoding lookup failed", { provider: "geoapify", reason: "http", status: response.status });
        if ([401, 403].includes(response.status))
          throw new ApiError(503, "Geoapify rejected the server API key or its access restrictions. Check GEOAPIFY_API_KEY and the key restrictions in Geoapify for this server.");
        if (response.status === 429)
          throw new ApiError(503, "The Geoapify request limit has been reached. Check the provider quota or try again later.");
        throw new ApiError(503, "Geoapify is unable to process this address lookup. Please try again later.");
      }
      const parsed = providerResult.parse(await response.json());
      const matches = parsed.results
        .filter((result) => result.country_code.toLowerCase() === "za")
        .map((result) => ({
          id:
            result.place_id ??
            digest(`${result.lat}:${result.lon}:${result.formatted}`),
          latitude: result.lat,
          longitude: result.lon,
          label: result.formatted,
          precision: result.result_type,
          confidence: result.rank?.confidence ?? 0,
        }));
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, {
        expires: Date.now() + (matches.length ? 86400000 : 600000),
        matches,
      });
      return matches;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const reason = error instanceof z.ZodError || error instanceof SyntaxError
        ? "invalid_response"
        : error !== null && typeof error === "object" && "name" in error && ["TimeoutError", "AbortError"].includes(String(error.name))
          ? "timeout"
          : "network";
      console.warn("Geocoding lookup failed", { provider: "geoapify", reason });
      throw new ApiError(
        503,
        reason === "timeout"
          ? "The address service timed out. Please try again."
          : reason === "invalid_response"
            ? "The address service returned an unexpected response. Please try again later."
            : "The server could not reach Geoapify. Please try again later.",
      );
    }
  })();
  pending.set(cacheKey, task);
  try {
    return await task;
  } finally {
    pending.delete(cacheKey);
  }
}
export async function autoGeocodeLocation<
  T extends {
    address: string;
    province: string;
    latitude?: number;
    longitude?: number;
  },
>(location: T, actor: string) {
  if (
    !geocodingEnabled() ||
    (location.latitude !== undefined && location.longitude !== undefined)
  )
    return location;
  try {
    const matches = await geocodeAddress(
      location.address,
      location.province,
      actor,
    );
    const precise = matches.filter(
      (match) =>
        ["building", "amenity"].includes(match.precision) &&
        match.confidence >= 0.9,
    );
    if (precise.length !== 1) return location;
    const match = precise[0];
    return {
      ...location,
      latitude: match.latitude,
      longitude: match.longitude,
      geocoding: {
        provider: "geoapify",
        label: match.label,
        precision: match.precision,
        confidence: match.confidence,
        reviewed: false,
        locatedAt: new Date(),
      },
    };
  } catch {
    return location;
  } // Registration remains available during a provider outage.
}
