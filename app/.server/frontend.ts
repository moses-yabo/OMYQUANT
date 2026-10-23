import { handleApi } from "./api";
export async function api(
  request: Request,
  path: string,
  method = "GET",
  payload?: unknown,
  idempotencyKey?: string,
) {
  const headers = new Headers();
  for (const key of ["Cookie", "Origin", "Sec-Fetch-Site"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (payload !== undefined) headers.set("Content-Type", "application/json");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return handleApi(
    new Request(new URL(`/api/v1/${path}`, request.url), {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    path.split("?")[0],
  );
}
export async function result<T>(response: Response): Promise<{
  data?: T;
  error?: {
    message: string;
    issues?: { path: (string | number)[]; message: string }[];
  };
}> {
  return response.json();
}
export const configured = () => Boolean(process.env.MONGODB_URI);
export function mutationOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  if (
    (request.headers.get("Origin") &&
      request.headers.get("Origin") !== expected) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new Response("Cross-origin mutation denied", { status: 403 });
}
