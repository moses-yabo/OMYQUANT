# Google sign-in

If sign-in fails while MongoDB is unreachable, the login page now reports the database outage explicitly rather than calling it a cancelled/expired Google attempt. Run `npm run mongo:check` for a read-only connection test and restore connectivity before starting a fresh Google sign-in. OAuth transactions, account resolution and session creation all require MongoDB; a working Google callback configuration cannot bypass that requirement. The temporary Google transaction cookie is still cleared on failure, and token/callback verification remains enforced.

Google sign-in is an additional method for the existing MongoDB user/session system. The repository uses React Router **8** Framework Mode, retaining its loaders/actions/resource routes; no downgrade to 7 was made. Email/password registration, scrypt hashes, existing opaque-cookie sessions, roles and logout remain in place. Browser-only demo authentication is separate and unchanged.

## Configuration and Google Cloud setup

1. In [Google Cloud Console](https://console.cloud.google.com/), select/create the project that will own OMYQUANT's OAuth clients.
2. Open **Google Auth platform** and complete **Branding** with the application name, support/developer contacts and required application/domain information. Configure **Audience** for the intended users. While an external app is in testing, add your test Google accounts in the test-user section.
3. Configure **Data Access** for only `openid`, `email` and `profile`. Do not request Gmail, Drive or offline access.
4. Under **Clients**, create a **Web application** OAuth client. For local development, add this exact authorized redirect URI:

   ```text
   http://localhost:5173/auth/google/callback
   ```

5. For production, use a separate production Web client and register this exact redirect URI for the current Render hostname:

   ```text
   https://omyquant.onrender.com/auth/google/callback
   ```

6. Securely copy the client ID/secret into server environment configuration. This implementation uses a server redirect, not Google's browser popup/One Tap library, so authorized JavaScript origins are not used by the flow. No API other than basic OIDC sign-in is needed.

Google requires exact redirect URI matching, including scheme, port, path and trailing slash. The source for setup is Google's [OIDC guide](https://developers.google.com/identity/openid-connect/openid-connect), [server flow guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [production policy guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

Set these locally in the ignored `.env` file (real credentials never belong in Git or chat):

```dotenv
MONGODB_URI=<dedicated Atlas or local replica-set connection>
APP_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=<local Web client ID>
GOOGLE_CLIENT_SECRET=<local Web client secret>
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback
```

Restart `npm run dev` after changes. If Vite selects a different port, stop the other server or update the registered redirect URI, APP_ORIGIN and GOOGLE_REDIRECT_URI together. HTTP is allowed only on local development loopback hosts. The button is disabled with a configuration hint until MongoDB and Google settings are provided. Configuring MongoDB selects existing server auth rather than browser demo mode; browser-local accounts/bookings are not imported.

For production, set `NODE_ENV=production`, retain the existing MongoDB connection, use `APP_ORIGIN=https://omyquant.onrender.com`, and use the production client ID/secret with `GOOGLE_REDIRECT_URI=https://omyquant.onrender.com/auth/google/callback`. A custom domain requires registering and configuring its own exact callback. Runtime secrets must be set in the hosting environment, not bundled into `VITE_*` variables. No deployment is performed by this change.

## Flow and account linking

1. `/login` and `/register` retain their existing email/password forms and add an accessible **Continue with Google** button using existing styles.
2. A same-origin **POST** to `/auth/google` starts the flow. GET does not initiate sign-in. An Origin header is required and foreign/cross-site requests are rejected.
3. The server generates random state, nonce and PKCE verifier; persists a ten-minute OAuthTransaction; and sets a random opaque, HttpOnly, SameSite=Lax cookie (Secure in production). The authorization request uses S256 PKCE and only the three identity scopes.
4. Google returns to **GET** `/auth/google/callback`. The cookie digest, state and explicit expiry must match. `findOneAndDelete` atomically consumes the transaction, preventing callback replay across processes. TTL is cleanup only. A second concurrent attempt in the same browser supersedes the transaction cookie; complete one sign-in at a time.
5. `oauth4webapi` exchanges the code server-side with the secret/verifier, validates issuer/audience/expiration/nonce and explicitly verifies the RS256 signature against Google's JWKS. Email must be verified. Browser-supplied profile JSON is never used.
6. `google-identity.ts` resolves the identity using `(provider, providerUserId)` from the verified `sub`, not email. A first-time Google user is created without a password. Returning Google users retain their existing OMYQUANT identity even when their Google email changes.
7. If an unlinked email already exists, sign-in stops. Authenticate using that existing account's password, return to `/login`, enter the password in **Confirm your existing password to link Google**, and choose **Link Google to your account**. Reauthentication is throttled and the transaction binds the account and current session digest. Callback requires the same still-active session/account. Different Google email addresses are allowed only through this explicit authenticated linking path.
8. The existing `login()` issues a fresh random 12-hour OMYQUANT cookie session. The current browser's old session is deleted; existing sessions on other devices remain valid. The OAuth cookie is cleared. Success always redirects to `/account`; arbitrary `returnTo` parameters are ignored.

No Google access/refresh/ID tokens are persisted in accounts, sessions, localStorage or logs. The verified name/email initialize a new user's profile; Google profile data does not overwrite existing account data or roles. Optional picture is extracted but is not currently persisted/displayed. Google-only accounts cannot log in with arbitrary passwords. Password creation/recovery and provider unlinking are outside this change.

## MongoDB additions and indexes

- `User.passwordHash` becomes optional for Google-only accounts. Email/password registration still explicitly requires a password and stores the same scrypt hash. No existing fields/records are removed or rehashed.
- `AuthIdentity`: User reference, provider (`google`) and providerUserId. Unique compound indexes on `(provider, providerUserId)` and `(user, provider)` prevent duplicate subjects across users and multiple Google identities on one user.
- `OAuthTransaction`: unique cookie-token digest, state, nonce, verifier, intent, optional linking user/session digest and explicit expiry, plus a TTL index.

New-user creation and identity attachment share a MongoDB transaction; linking is transactional too. Email and identity uniqueness arbitrate concurrent attempts. A conflict safely asks the user to authenticate/retry rather than guessing by email. No destructive migration or existing-account backfill is needed. A replica set/Atlas is required. Provision/verify these new indexes and collection permissions before enabling traffic. Initiation waits for model initialization/index creation using the existing Mongoose configuration; installations with automatic index creation disabled must provision the indexes explicitly. Never remove unique indexes to work around a conflict.

## Manual local verification

Use a disposable replica-set database and test Google accounts, not production/customer data.

1. Verify existing password registration, login, `/account`, logout and re-login.
2. Sign in with a new Google identity; inspect that User has no password and one AuthIdentity is attached. Confirm `/account` loads and logout ends access.
3. Sign in again with that Google identity; verify the same User ID and no duplicate record.
4. Create a password account with a test Google email. Google sign-in must refuse automatic linking. Sign in by password, visit `/login`, reauthenticate and link Google. Then sign out and use Google to access that same User ID.
5. Cancel consent, tamper with state, replay a callback, wait past ten minutes and change/logout the linking session. Each must fail without authenticating or changing existing accounts.
6. Test two simultaneous first logins and two competing links against the actual unique indexes. Confirm no duplicate identities/orphan users and verify transaction rollback/retry behavior.
7. Check mobile viewport, keyboard access, loading/error states, and existing forms. Confirm callback URLs/secrets/tokens are not retained in application or proxy access logs; configure redaction where the host records query strings.

Automated checks are `npm run typecheck` and `npm test`. `tests/google.test.mjs` uses real generated RSA keys and the actual OAuth library with intercepted HTTPS responses; persistence is mocked. `tests/server-auth.test.mjs` exercises existing API registration/login/logout/protection with real scrypt and mocked database access. These are not live Google consent, MongoDB integration or browser-automation tests.

## Future native clients

Reuse verified-subject identity resolution and existing User/Business identities. A native implementation will need a separately registered platform OAuth client, system-browser authorization with PKCE, approved app/universal-link callbacks, platform-specific audience verification and a separately agreed secure backend session transport. Never embed this web client secret in a native app, reuse browser-owned demo JWTs, or trust a mobile-supplied profile. No native flow or new JWT system is introduced here.

## Files and operational limits

Server logic is in `app/.server/modules/auth/google{,-provider,-identity}.ts`, with resource routes `app/routes/google.ts` and `google-callback.ts`. Other changes are the minimal User/identity/transaction schemas, route registration, existing auth-page additions, Vite server-only environment loading, `.env.example`, dependency lockfile, tests and documentation.

Google/network/configuration failures redirect to fixed existing-login messages with no provider error text or secrets. No new global styles or page redesign were introduced. Authentication initiation still needs deployment ingress rate limits in addition to the per-account linking throttle and existing password-login throttle. Live Google credentials/consent, real MongoDB concurrency, actual browser UX and production hosting must be verified manually before release.

Implementation verification on 20 October 2026: `npm run typecheck` passed; `npm test` passed the production build and all **57 tests in six Jest suites**. `git diff --check` and local documentation-link checks passed. A search of generated client assets found no Google client-secret configuration, token endpoint or PKCE-verifier server code. This does not replace live consent/browser/database verification. npm reported 19 moderate dependency findings during installation; no unrelated forced upgrades were applied.
