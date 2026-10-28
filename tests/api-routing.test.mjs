import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import * as db from "../app/.server/database/models.ts";
import { handleApi } from "../app/.server/api.ts";
import { sessionCookie } from "../app/.server/modules/auth/auth.ts";

const previousUri = process.env.MONGODB_URI;
const previousOrigin = process.env.APP_ORIGIN;
const customer = "a".repeat(24);
let cookie;

beforeEach(async () => {
  process.env.MONGODB_URI = "mongodb://unused-routing-unit-test";
  process.env.APP_ORIGIN = "https://example.test";
  jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
  jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: customer });
  jest.spyOn(db.User, "findOne").mockResolvedValue({ _id: customer, active: true, admin: false });
  cookie = await sessionCookie.serialize("1".repeat(64));
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of [["MONGODB_URI", previousUri], ["APP_ORIGIN", previousOrigin]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(path, body, contentType = "application/json") {
  return new Request(`https://example.test/api/v1/${path}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: "https://example.test", "Content-Type": contentType },
    body,
  });
}

test("late transport request handler receives the untouched body and authenticated customer", async () => {
  const create = jest.spyOn(db.TransportRequest, "create").mockImplementation(async input => input);
  const payload = {
    kind: "charter", passengers: 8,
    pickup: { address: "Pretoria station", province: "Gauteng" },
    dropoff: { address: "Johannesburg station", province: "Gauteng" },
    startsAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const response = await handleApi(request("business-transport/requests", JSON.stringify(payload)), "business-transport/requests");
  expect(response.status).toBe(201);
  expect(create).toHaveBeenCalledWith({ ...payload, startsAt: new Date(payload.startsAt), customer });
  expect((await response.json()).data.customer).toBe(customer);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test.each([
  ["{", "application/json", 400, "Invalid JSON"],
  ["{}", "text/plain", 415, "Use application/json"],
  [JSON.stringify({ padding: "x".repeat(65536) }), "application/json", 413, "Request too large"],
])("late handlers retain JSON validation and error envelopes (case %#)", async (body, contentType, status, message) => {
  const create = jest.spyOn(db.TransportRequest, "create");
  const response = await handleApi(request("business-transport/requests", body, contentType), "business-transport/requests");
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { message } });
  expect(create).not.toHaveBeenCalled();
});

test("unmatched authenticated endpoint returns 404 without consuming the request body", async () => {
  const input = request("unknown", "{}");
  const response = await handleApi(input, "unknown");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Endpoint not found" } });
  expect(input.bodyUsed).toBe(false);
});
