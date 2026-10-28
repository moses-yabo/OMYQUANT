import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";

export const accountsKey = "omyquant.accounts.v1";
export const sessionKey = "omyquant.session.v1";
export const jwtSigningKey = "omyquant.demo-jwt-key.v1";
const issuer = "omyquant-browser-demo";
const audience = "omyquant-browser";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Account = {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
};
const credentials = z
  .object({
    email: z.string().trim().email().toLowerCase(),
    password: z.string().min(12).max(128),
  })
  .strict();
function accounts(storage: StorageLike): Account[] {
  return z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        salt: z.string().regex(/^[a-f0-9]{32}$/),
        passwordHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .parse(JSON.parse(storage.getItem(accountsKey) ?? "[]"));
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function signingKey(storage: StorageLike, create = false) {
  let value = storage.getItem(jwtSigningKey);
  if (!value && create) {
    value = hex(crypto.getRandomValues(new Uint8Array(32)));
    storage.setItem(jwtSigningKey, value);
  }
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(
      "Browser session key is missing or invalid. Please sign in again.",
    );
  return Uint8Array.from(value.match(/../g)!, (part) => parseInt(part, 16));
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = Uint8Array.from(salt.match(/../g)!, (value) =>
    parseInt(value, 16),
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: bytes, iterations: 100000 },
        key,
        256,
      ),
    ),
  );
}
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("omyquant:auth-changed"));
}
export async function registerBrowser(
  input: unknown,
  storage: StorageLike = localStorage,
) {
  const value = credentials
    .extend({ name: z.string().trim().min(1).max(100) })
    .parse(input);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(value.password, salt);
  const save = () => {
    const users = accounts(storage);
    if (users.some((user) => user.email === value.email))
      throw new Error(
        "An account with that email already exists in this browser.",
      );
    storage.setItem(
      accountsKey,
      JSON.stringify([
        ...users,
        {
          id: crypto.randomUUID(),
          name: value.name,
          email: value.email,
          salt,
          passwordHash: hash,
        },
      ]),
    );
  };
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    navigator.locks
  )
    await navigator.locks.request(accountsKey, save);
  else save();
}
export async function loginBrowser(
  input: unknown,
  storage: StorageLike = localStorage,
) {
  const value = credentials.parse(input);
  const user = accounts(storage).find(
    (account) => account.email === value.email,
  );
  const actual = await passwordHash(
    value.password,
    user?.salt ?? "0".repeat(32),
  );
  if (!user || actual !== user.passwordHash)
    throw new Error("Invalid email or password.");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("12h")
    .setJti(crypto.randomUUID())
    .sign(signingKey(storage, true));
  storage.setItem(sessionKey, token);
  changed();
  return { id: user.id, name: user.name, email: user.email };
}
export async function currentBrowserUser(storage: StorageLike = localStorage) {
  const raw = storage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(
      raw,
      signingKey(storage),
      {
        algorithms: ["HS256"],
        issuer,
        audience,
        requiredClaims: ["sub", "exp", "iat", "jti"],
      },
    );
    if (protectedHeader.typ !== "JWT" || typeof payload.sub !== "string")
      throw new Error("Invalid session");
    const user = accounts(storage).find(
      (account) => account.id === payload.sub,
    );
    if (!user) throw new Error("Account not found");
    return { id: user.id, name: user.name, email: user.email };
  } catch {
    storage.removeItem(sessionKey);
    return null;
  }
}
export function logoutBrowser(storage: StorageLike = localStorage) {
  storage.removeItem(sessionKey);
  changed();
}
export function browserAuthError(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues.map((issue) => issue.message).join(" · ")
    : error instanceof Error
      ? error.message
      : "Browser storage is unavailable.";
}
