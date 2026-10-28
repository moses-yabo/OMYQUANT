# Application architecture

Audited 20 October 2026. Repository code is the source of truth; compilation and unit tests do not establish database or hosted-production readiness.

## Runtime and boundaries

OMYQUANT is a React Router Framework Mode modular monolith using React 19, React Router 8, TypeScript, Vite and plain CSS. SSR is enabled in `react-router.config.ts`. There is no separate Express API. Tailwind packages/plugin were removed after converting the remaining utility classes. `app/styles/reset.css` preserves the former browser normalization as standard CSS with its MIT attribution; page styles no longer require a CSS framework/compiler.

| Boundary | Implementation |
| --- | --- |
| Routes and customer forms | `app/routes.ts`, `app/routes/*.tsx`, `app/routes/reserve.ts` |
| Resource API | `app/routes/api.ts` forwards `/api/v1/*` to `app/.server/api.ts` |
| Internal API adapter | `app/.server/frontend.ts` invokes the API handler directly, preserving cookie/origin headers; no self-HTTP calls |
| Authentication | `app/.server/modules/auth/auth.ts` and separate browser demo `app/lib/browser-auth.ts` |
| Domain operations | `app/.server/modules/inventory.ts`, resource definitions/validation in `modules/resources.ts` |
| Persistence/access | `app/.server/database/{connect,models}.ts`, `shared/{access,http}.ts` |
| Browser demo | `app/lib/local-bookings.ts`, `local-booking-store.ts`, `marketplace.ts` |
| Realtime and production HTTP | `scripts/realtime.ts`, `scripts/server.ts` |

Domain directories are logical boundaries within one deployment. Keep further extractions incremental and preserve behavior.

Optional Redis catalog query caching lives under `app/.server/cache/`. It stores only 30-second public search ID selections; provider eligibility and record contents remain live MongoDB reads. The discovery handler is the only caller. Private reads, authentication, taxi availability and mutations bypass the cache. Redis errors fail open to the existing database path. See [Redis setup and consistency limits](redis-cache.md).

The API entry point now delegates endpoint handling to `app/.server/api/` modules for authentication, discovery, business management, resources, transport, bookings, rentals, logistics, orders and charter requests. `api.ts` retains mutation-origin checks, database connection, the public/authenticated boundary, ordered dispatch and common error handling. Shared JSON-body limits, response headers and pagination remain in `api/http.ts`. Each handler returns a response when matched and otherwise leaves the request body available for subsequent handlers. Domain permissions and transactions remain inside the corresponding handlers and existing domain services.

Business-tool loaders/actions live in `app/.server/route-handlers/business-tools.ts`; the route retains its Framework Mode exports and UI. Their serialized data contract is in `app/lib/business-tool-data.ts`. Marketplace booking and rental dialog markup/hooks live in `app/components/listing-dialog.tsx`, with discovery and filtering remaining in the home route. These extractions preserve URLs and existing markup; they do not add services, dependencies or workflows.

The business-tools route composes UI from `app/components/business-tools/`: overview statistics, the records panel, record cards, editing and status forms, and the creation form. Farming, rental, transport and logistics fields live in their respective component files; customer enquiries and delivery quote/assignment controls are separate record components. Components retain the existing form names, field order, multipart uploads, permissions and status choices. These UI visibility checks complement the existing server authorization and do not replace it. `tests/business-tools-ui.test.mjs` exercises the production SSR component with synthetic data; it does not establish browser interaction or MongoDB concurrency.

## Runtime modes and authentication

| Mode | Selection | Identity and data |
| --- | --- | --- |
| MongoDB | `MONGODB_URI` configured | Server-side scrypt password hashes; random opaque session cookie; SHA-256 session digest in MongoDB; domain records in MongoDB |
| Browser demo | No URI and `DEMO_MODE=true`; also the development default unless explicitly false | PBKDF2 password hashes, jose HS256 JWT and signing key in localStorage; per-account sample bookings |
| Catalog preview | No URI and demo disabled | Sample catalog; server business mutations unavailable |

Both authentication implementations exist. Server sessions last 12 hours, use HttpOnly/SameSite=Lax cookies and Secure in production, reject disabled users, and check expiry explicitly. Registration does not automatically log in. Login throttling is database-backed per normalized email/time bucket. Browser JWTs also expire after 12 hours, but their signing key and accounts are browser-owned; they cannot establish trusted server identity and are not accepted by the API. No SQLite persistence is used. Do not replace either mode or migrate identities implicitly. See [local-auth.md](local-auth.md).

User `admin` is a platform permission, while `superAdmin` permits managing regular admin access. `Membership` grants business-scoped owner/manager/staff access. `manage()` checks active business, matching service type and membership (or platform admin); typed service access additionally requires verification, including for admins. `owns()` checks customer identity (or admin). Owners/managers manage enabled services; staff require explicit business-scoped service read/write permissions. Private verification evidence uses a separate GridFS bucket. See [optional multi-business management](multi-business.md). Owner-only profile/membership administration is separate from verified service tools. Changing service types resets verification. Admin provisioning uses the operator-only `scripts/admin.ts` command. `/admin/businesses` checks the current database role and records verification decisions in BusinessReview transactionally; see [admin setup](admin.md) and [business tools](business-tools.md).

Google sign-in extends only the MongoDB mode: `google-provider.ts` validates the authorization-code/PKCE flow and ID-token signature/claims using oauth4webapi; `google-identity.ts` transactionally resolves verified provider subjects; `google.ts` binds one-use OAuth transactions to the browser and rotates into the existing session. AuthIdentity unique indexes prevent duplicate subjects. Linking requires the current server session and password reauthentication, never email matching alone. User.passwordHash is optional for Google-only creation; password registration remains unchanged. Auth-page Google controls are the explicitly requested UI addition, with existing styles/layout preserved. See [Google authentication](google-auth.md).

## Frontend routing

`/` is discovery; `/login` and `/register` are validated values of `:mode`; `/account` shows customer activity; `/reserve` is mutation-only; `/business` provides onboarding and access to `/business/:id/tools` for verified service management; `/request/delivery` and `/request/transport` collect requests. Unknown auth/request modes return 404. Preserve these URLs, navigation, styling and responsive behavior.

Server loaders/actions use the internal adapter. Demo client loaders/actions restore local accounts and bookings after hydration. Business onboarding, delivery and charter persistence require MongoDB even in demo mode. Saved listing IDs are localStorage references, not inventory copies. Marketplace reads load up to 100 records per service/page, with filtering limitations described in [frontend.md](frontend.md).

## Persistence, API and realtime

Mongoose models are shared across services; transactions require a replica set/Atlas and provisioned indexes. The connector caches its connection promise and clears it after a failed connection. Money uses integer ZAR cents. Zod validates API payloads, pagination and IDs. Responses use `{data}` or `{error: {message, issues?}}`; unexpected errors become a generic 503. Mutations reject foreign origins/cross-site requests; JSON bodies are limited to 64 KiB. Origin checks do not substitute for authentication or authorization. See [backend.md](backend.md) for endpoint contracts and [DATA_MODEL.md](DATA_MODEL.md) for relationships.

Socket.IO shares the Vite HTTP server in development and custom Node HTTP server in production. Browser-selected random rooms carry refresh signals only, with no account/booking payload or persistence. Rooms are not authenticated identities; this does not synchronize inventory across devices. Server database workflows do not publish durable domain notifications. Web Locks serialize demo writes per account in one browser origin, not across customers.

Initial browser notifications are an opt-in client feature after successful `/reserve` responses. A TypeScript service worker handles notification clicks; its URL emission is isolated in `.client` to preserve the asset in the production client build. This does not add server push, a durable inbox or pickup/drop-off notifications. See [notifications.md](notifications.md).

`npm run build` emits `build/client`, `build/server` and compiled TypeScript runtime `build/runtime`. `npm start` serves all three concerns together. The server pins the external origin from `APP_ORIGIN` or `RENDER_EXTERNAL_URL` rather than trusting arbitrary forwarded headers. Existing deployment guidance remains in [render.md](render.md); this audit makes no hosting changes.

## Main risks and verification boundaries

- Browser-only identity/inventory is for demonstrations; multi-user operations require server persistence and authorization.
- Transactional stock/seats and trailer calendar writes exist, but real database rollback/retry/concurrent booking tests are missing.
- Trailer requests do not hold inventory or confirm instantly. Operating conditions, blocked dates and cancellation policies are incomplete.
- Listing image uploads use GridFS with business access checks and publication-aware reads. New/changed image arrays must reference existing GridFS files owned by the same business; external URLs are rejected. Historical records are not automatically rewritten. Document URLs still lack a private upload/access pipeline or scanning. Public resource responses need a field-level exposure review before real documents are stored. Image quotas, resizing and orphan retention remain operational follow-up work; see [images.md](images.md).
- Provider schedule collisions, booking idempotency, durable notifications, general operational audit trails, password recovery and email verification are missing. Business verification decisions now have a transactional audit history.
- Public list visibility and booking/provider eligibility need consistent enforcement. Seat booking now rechecks active operator status inside its transaction; this is not a global provider-state lock against simultaneous administrative deactivation.

Tests cover browser authentication, local booking rules, HTTP boundaries and the runtime/realtime bridge. The focused server inventory unit tests use mocked persistence; they do not prove MongoDB atomicity. There is no configured lint command or browser automation suite. See [testing.md](testing.md), [FEATURE_MATRIX.md](FEATURE_MATRIX.md) and [BOOKING_ENGINE.md](BOOKING_ENGINE.md).

## Audit verification: 20 October 2026

`npm run typecheck` passed. `npm test` passed the production client/SSR/runtime build and all 18 tests in four Jest suites. The inactive-operator regression failed before the eligibility check was added, then passed in the full suite. `git diff --check` passed. Jest emitted its existing experimental VM Modules warning; Vite emitted a plugin timing diagnostic.

No live MongoDB integration, browser interaction, external imagery availability or hosted deployment verification was performed. No UI, authentication flow, dependency, hosting configuration or business workflow was replaced. The only application-code change was the transactional active-operator check in seat booking. No lint command is configured.
