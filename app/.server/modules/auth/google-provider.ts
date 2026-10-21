import * as oauth from "oauth4webapi";
import { z } from "zod";
import { ApiError } from "../../shared/http";

// Pinned Google endpoints. No endpoint or issuer is taken from browser input.
export const googleServer: oauth.AuthorizationServer = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  id_token_signing_alg_values_supported: ["RS256"],
};
export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};
export type GoogleTransaction = {
  state: string;
  nonce: string;
  verifier: string;
};
export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: true;
  name: string;
  picture?: string;
};

export function googleConfig(request: Request): GoogleConfig {
  if (!process.env.MONGODB_URI)
    throw new ApiError(
      503,
      "Google sign-in requires MongoDB; browser demo accounts remain separate.",
    );
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri)
    throw new ApiError(
      503,
      "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI on the server to enable Google sign-in.",
    );
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new ApiError(
      503,
      "GOOGLE_REDIRECT_URI must be an absolute callback URL.",
    );
  }
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    redirect.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if (
    (redirect.protocol !== "https:" && !localHttp) ||
    redirect.origin !== origin ||
    redirect.origin !== new URL(request.url).origin ||
    redirect.pathname !== "/auth/google/callback" ||
    redirect.search ||
    redirect.hash ||
    redirect.username ||
    redirect.password
  )
    throw new ApiError(
      503,
      "Google callback must match APP_ORIGIN and /auth/google/callback, using HTTPS except on local development.",
    );
  return { clientId, clientSecret, redirectUri };
}

export function googleAvailability(request: Request) {
  try {
    googleConfig(request);
    return { enabled: true, reason: "" };
  } catch (error) {
    return {
      enabled: false,
      reason:
        error instanceof ApiError
          ? error.message
          : "Google sign-in is unavailable.",
    };
  }
}

export async function googleAuthorization(config: GoogleConfig) {
  const transaction: GoogleTransaction = {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    verifier: oauth.generateRandomCodeVerifier(),
  };
  const url = new URL(googleServer.authorization_endpoint!);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(
      transaction.verifier,
    ),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url, transaction };
}

// Fetch injection permits real protocol/signature verification with test keys;
// production always uses the platform fetch and pinned HTTPS endpoints.
export async function exchangeGoogleCode(
  config: GoogleConfig,
  callback: URL,
  transaction: GoogleTransaction,
  fetcher?: typeof fetch,
): Promise<GoogleProfile> {
  if (callback.origin + callback.pathname !== config.redirectUri)
    throw new ApiError(400, "Invalid Google callback.");
  const client: oauth.Client = {
    client_id: config.clientId,
    id_token_signed_response_alg: "RS256",
  };
  const params = oauth.validateAuthResponse(
    googleServer,
    client,
    callback,
    transaction.state,
  );
  const options = {
    signal: AbortSignal.timeout(10000),
    ...(fetcher ? { [oauth.customFetch]: fetcher } : {}),
  };
  const response = await oauth.authorizationCodeGrantRequest(
    googleServer,
    client,
    oauth.ClientSecretPost(config.clientSecret),
    params,
    config.redirectUri,
    transaction.verifier,
    options,
  );
  const tokens = await oauth.processAuthorizationCodeResponse(
    googleServer,
    client,
    response,
    { expectedNonce: transaction.nonce, requireIdToken: true },
  );
  // oauth4webapi validates claims on the token response; explicitly verify the
  // ID-token signature against Google's JWKS as well.
  await oauth.validateApplicationLevelSignature(
    googleServer,
    response,
    options,
  );
  const claims = z
    .object({
      sub: z.string().min(1).max(255),
      email: z.email().max(320),
      email_verified: z.literal(true),
      name: z.string().trim().min(1).max(2000).optional(),
      picture: z.url().optional(),
    })
    .parse(oauth.getValidatedIdTokenClaims(tokens));
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: true,
    name: claims.name ?? claims.email.split("@")[0],
    ...(claims.picture ? { picture: claims.picture } : {}),
  };
}
