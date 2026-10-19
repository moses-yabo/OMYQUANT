import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { createCookie } from "react-router";
import { User, Session } from "../../database/models";
import { ApiError } from "../../shared/http";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, hex] = hash.split(":");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const sessionCookie = createCookie("omyquant_session", {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 43200,
});
export async function sessionToken(request: Request): Promise<string> {
  const value: unknown = await sessionCookie.parse(
    request.headers.get("Cookie"),
  );
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export async function authenticate(request: Request) {
  const token = await sessionToken(request);
  const session =
    token &&
    (await Session.findOne({
      digest: digest(token),
      expiresAt: { $gt: new Date() },
    }));
  const user =
    session && (await User.findOne({ _id: session.user, active: true }));
  if (!user) throw new ApiError(401, "Authentication required");
  return { id: String(user._id), admin: Boolean(user.admin) };
}
export async function login(userId: unknown) {
  const token = randomBytes(32).toString("hex");
  await Session.create({
    user: String(userId),
    digest: digest(token),
    expiresAt: new Date(Date.now() + 43200000),
  });
  return sessionCookie.serialize(token);
}
