import { z } from "zod";
import { connectToDatabase, isDatabaseUnavailable } from "./database/connect";
import { ImageError } from "./database/images";
import { authenticate } from "./modules/auth/auth";
import { ApiError } from "./shared/http";
import { headers, json } from "./api/http";
import { registrationAndLogin, accountRoutes } from "./api/auth";
import { publicDiscovery } from "./api/discovery";
import { operationalRoutes } from "./api/operations";
import { businessDetails, businessMemberships } from "./api/businesses";
import { resourceRoutes } from "./api/resources";
import { departureRoutes, tripRoutes } from "./api/transport";
import { bookingRoutes } from "./api/bookings";
import { rentalRoutes } from "./api/rentals";
import { logisticsRoutes } from "./api/logistics";
import { orderRoutes } from "./api/orders";
import { charterRoutes } from "./api/charters";
import { historyRoutes } from "./api/history";

export async function handleApi(request: Request, path: string) {
  try {
    const method = request.method;
    const url = new URL(request.url);
    if (method !== "GET" && method !== "HEAD") {
      const expected = process.env.APP_ORIGIN ?? url.origin;
      if (
        request.headers.get("Origin") &&
        request.headers.get("Origin") !== expected
      )
        throw new ApiError(403, "Cross-origin mutation denied");
      if (request.headers.get("Sec-Fetch-Site") === "cross-site")
        throw new ApiError(403, "Cross-site mutation denied");
    }
    if (path === "health" && method === "GET")
      return json({ service: "OMYQUANT", framework: "React Router" });
    if (
      !process.env.MONGODB_URI &&
      ["auth/register", "auth/login", "auth/logout", "users/me"].includes(path)
    )
      throw new ApiError(
        503,
        "Use browser demo authentication while MongoDB is disconnected.",
      );
    await connectToDatabase();
    const publicContext = { request, path, method, url };
    const registrationAndLoginResponse = await registrationAndLogin(publicContext);
    if (registrationAndLoginResponse) return registrationAndLoginResponse;
    const publicDiscoveryResponse = await publicDiscovery(publicContext);
    if (publicDiscoveryResponse) return publicDiscoveryResponse;
    const actor = await authenticate(request);
    const context = { ...publicContext, actor };
    // Keep handler precedence explicit; unmatched handlers leave the body unread.
    for (const handler of [
      operationalRoutes,
      businessDetails,
      accountRoutes,
      businessMemberships,
      resourceRoutes,
      departureRoutes,
      bookingRoutes,
      rentalRoutes,
      logisticsRoutes,
      orderRoutes,
      tripRoutes,
      charterRoutes,
      historyRoutes,
    ]) {
      const response = await handler(context);
      if (response) return response;
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof ApiError || error instanceof ImageError)
      return Response.json(
        { error: { message: error.message } },
        { status: error.status, headers },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: { message: "Validation failed", issues: error.issues } },
        { status: 400, headers },
      );
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    )
      return Response.json(
        { error: { message: "Resource already exists" } },
        { status: 409, headers },
      );
    if (isDatabaseUnavailable(error))
      return Response.json(
        {
          error: {
            message:
              "Marketplace database is temporarily unreachable. Please try again shortly.",
          },
        },
        { status: 503, headers: { ...headers, "Retry-After": "10" } },
      );
    console.error(
      "API request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      { error: { message: "Service temporarily unavailable" } },
      { status: 503, headers },
    );
  }
}
