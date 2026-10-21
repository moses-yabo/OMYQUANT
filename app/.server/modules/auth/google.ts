import { randomBytes } from "node:crypto";
import { createCookie, redirect } from "react-router";
import { connect } from "../../database/connect";
import {
  AuthIdentity,
  LoginAttempt,
  OAuthTransaction,
  Session,
  User,
} from "../../database/models";
import { mutationOrigin } from "../../frontend";
import { ApiError } from "../../shared/http";
import {
  authenticate,
  digest,
  login,
  sessionToken,
  verifyPassword,
} from "./auth";
import {
  exchangeGoogleCode,
  googleAuthorization,
  googleConfig,
} from "./google-provider";
import { GoogleAccountConflict, resolveGoogleUser } from "./google-identity";

export const googleCookie = () =>
  createCookie("omyquant_google", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
const noStore = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function startGoogle(request: Request) {
  // Initiation and linking are POST-only, with a required browser Origin.
  mutationOrigin(request);
  if (request.method !== "POST" || !request.headers.get("Origin"))
    throw new ApiError(403, "Start Google sign-in from the account form.");
  const config = googleConfig(request);
  await connect();
  // Finish creating unique/TTL indexes before the first OAuth operation.
  await Promise.all([
    User.init(),
    AuthIdentity.init(),
    OAuthTransaction.init(),
  ]);
  const form = await request.formData();
  const intent = form.get("intent") ?? "login";
  if (intent !== "login" && intent !== "link")
    throw new ApiError(400, "Invalid Google sign-in request.");
  let user: string | undefined;
  let sessionDigest: string | undefined;
  if (intent === "link") {
    const actor = await authenticate(request);
    const attempt = await LoginAttempt.findOneAndUpdate(
      {
        key: `google-link:${digest(actor.id)}:${Math.floor(Date.now() / 900000)}`,
      },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + 1800000) },
      },
      { upsert: true, new: true },
    );
    if (Number(attempt.count) > 10)
      throw new ApiError(429, "Too many linking attempts; try later.");
    const account = await User.findOne({ _id: actor.id, active: true }).select(
      "+passwordHash",
    );
    const password = form.get("password");
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128 ||
      !account?.passwordHash ||
      !(await verifyPassword(password, String(account.passwordHash)))
    )
      throw new ApiError(
        401,
        "Sign in again with your existing password before linking Google.",
      );
    user = actor.id;
    sessionDigest = digest(await sessionToken(request));
  }
  const { url, transaction } = await googleAuthorization(config);
  const token = randomBytes(32).toString("hex");
  await OAuthTransaction.create({
    digest: digest(token),
    ...transaction,
    intent,
    ...(user ? { user, sessionDigest } : {}),
    expiresAt: new Date(Date.now() + 600000),
  });
  return redirect(url.href, {
    status: 303,
    headers: {
      ...noStore,
      "Set-Cookie": await googleCookie().serialize(token),
    },
  });
}

export async function consumeGoogleTransaction(request: Request) {
  const token: unknown = await googleCookie().parse(
    request.headers.get("Cookie"),
  );
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !state ||
    params.getAll("state").length !== 1
  )
    throw new ApiError(400, "Google sign-in expired or invalid.");
  // Atomic removal provides one-time use across processes. TTL is cleanup only.
  const transaction = await OAuthTransaction.findOneAndDelete({
    digest: digest(token),
    state,
    expiresAt: { $gt: new Date() },
  });
  if (!transaction)
    throw new ApiError(400, "Google sign-in expired or invalid.");
  return transaction;
}

export async function completeGoogle(request: Request) {
  const config = googleConfig(request);
  await connect();
  const transaction = await consumeGoogleTransaction(request);
  const profile = await exchangeGoogleCode(config, new URL(request.url), {
    state: String(transaction.state),
    nonce: String(transaction.nonce),
    verifier: String(transaction.verifier),
  });
  let linkingUser: string | undefined;
  if (transaction.intent === "link") {
    const actor = await authenticate(request);
    if (
      actor.id !== String(transaction.user) ||
      digest(await sessionToken(request)) !== transaction.sessionDigest
    )
      throw new ApiError(401, "Sign in again before linking Google.");
    linkingUser = actor.id;
  }
  const userId = await resolveGoogleUser(profile, linkingUser);
  // Existing mechanism issues an independent random session, never a Google token.
  const cookie = await login(userId);
  const previous = await sessionToken(request);
  if (previous) await Session.deleteOne({ digest: digest(previous) });
  const headers = new Headers(noStore);
  headers.append("Set-Cookie", cookie);
  headers.append(
    "Set-Cookie",
    await googleCookie().serialize("", { maxAge: 0 }),
  );
  // Fixed existing destination; no browser-provided redirect can become an open redirect.
  return redirect("/account", { status: 303, headers });
}

export async function googleFailure(error: unknown) {
  // Never reflect provider error text, tokens, callback query strings or secrets.
  const reason =
    error instanceof GoogleAccountConflict
      ? "account_exists"
      : error instanceof ApiError && error.status === 503
        ? "unavailable"
        : error instanceof ApiError && error.status === 401
          ? "reauthenticate"
          : "failed";
  return redirect(`/login?google=${reason}`, {
    status: 303,
    headers: {
      ...noStore,
      "Set-Cookie": await googleCookie().serialize("", { maxAge: 0 }),
    },
  });
}
