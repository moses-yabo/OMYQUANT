import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import mongoose from "mongoose";
import * as db from "../app/.server/database/models.ts";
import { handleApi } from "../app/.server/api.ts";
import {
  digest,
  hashPassword,
  sessionCookie,
  verifyPassword,
} from "../app/.server/modules/auth/auth.ts";

const previousUri = process.env.MONGODB_URI;
const previousOrigin = process.env.APP_ORIGIN;
const userId = "a".repeat(24);
beforeEach(() => {
  process.env.MONGODB_URI = "mongodb://unused-in-auth-unit-test";
  process.env.APP_ORIGIN = "https://example.test";
  jest.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (previousUri === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = previousUri;
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
});
const request = (path, payload, cookie) =>
  new Request(`https://example.test/api/v1/${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });

test("existing registration still validates credentials and stores a scrypt hash", async () => {
  const create = jest
    .spyOn(db.User, "create")
    .mockImplementation(async (value) => ({ _id: userId, ...value }));
  const response = await handleApi(
    request("auth/register", {
      name: "Existing method",
      email: "User@example.test",
      password: "existing-password-123",
    }),
    "auth/register",
  );
  expect(response.status).toBe(201);
  const saved = create.mock.calls[0][0];
  expect(saved.email).toBe("user@example.test");
  expect(
    await verifyPassword("existing-password-123", saved.passwordHash),
  ).toBe(true);
  expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  const invalid = await handleApi(
    request("auth/register", {
      name: "User",
      email: "u@example.test",
      password: "short",
      admin: true,
    }),
    "auth/register",
  );
  expect(invalid.status).toBe(400);
});
test("existing password login still creates the same opaque server session", async () => {
  const passwordHash = await hashPassword("existing-password-123");
  jest
    .spyOn(db.User, "findOne")
    .mockReturnValue({ select: async () => ({ _id: userId, passwordHash }) });
  jest
    .spyOn(db.LoginAttempt, "findOneAndUpdate")
    .mockResolvedValue({ count: 1 });
  const create = jest.spyOn(db.Session, "create").mockResolvedValue({});
  const response = await handleApi(
    request("auth/login", {
      email: "u@example.test",
      password: "existing-password-123",
    }),
    "auth/login",
  );
  expect(response.status).toBe(200);
  const token = await sessionCookie.parse(response.headers.get("Set-Cookie"));
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(create).toHaveBeenCalledWith({
    user: userId,
    digest: digest(token),
    expiresAt: expect.any(Date),
  });
  expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly/);
});
test("Google-only account cannot log in with an arbitrary password", async () => {
  jest
    .spyOn(db.User, "findOne")
    .mockReturnValue({ select: async () => ({ _id: userId }) });
  jest
    .spyOn(db.LoginAttempt, "findOneAndUpdate")
    .mockResolvedValue({ count: 1 });
  const create = jest.spyOn(db.Session, "create");
  const response = await handleApi(
    request("auth/login", {
      email: "google@example.test",
      password: "arbitrary-password-123",
    }),
    "auth/login",
  );
  expect(response.status).toBe(401);
  expect(create).not.toHaveBeenCalled();
});
test("protected routes still require sessions and logout deletes their digest", async () => {
  expect((await handleApi(request("users/me"), "users/me")).status).toBe(401);
  const token = "1".repeat(64);
  jest.spyOn(db.Session, "findOne").mockResolvedValue({ user: userId });
  jest
    .spyOn(db.User, "findOne")
    .mockResolvedValue({ _id: userId, active: true, admin: false });
  const remove = jest
    .spyOn(db.Session, "deleteOne")
    .mockResolvedValue({ deletedCount: 1 });
  const response = await handleApi(
    request("auth/logout", {}, await sessionCookie.serialize(token)),
    "auth/logout",
  );
  expect(response.status).toBe(200);
  expect(remove).toHaveBeenCalledWith({ digest: digest(token) });
  expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
});
