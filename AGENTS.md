# OMYQUANT repository instructions

OMYQUANT is a South African asset-light marketplace connecting customers with independent farmers, taxi operators, logistics providers and trailer rental businesses. Market (formerly YM Farm) and Transport & Logistics (formerly Quanter Deliver) share one platform. OMYQUANT does not own the fleets or trailers.

## Preserve the application

- Do not redesign/restyle/restructure UI, alter global styles, navigation presentation, responsive behavior or existing URLs, or add customer screens without explicit approval.
- Inspect actual code before changes. Preserve working login/registration/session flows. Authentication replacement requires explicit approval; do not infer that it is missing.
- Keep React Router Framework Mode full stack and TypeScript, with `.server` boundaries. Prefer this modular monolith; no separate Express API, microservices or projects without instruction.
- Styling uses plain CSS, including browser resets in `app/styles/reset.css`. Tailwind and its Vite plugin were removed; do not reintroduce utility classes requiring that compiler. Preserve existing layouts and scoped component styles.
- Do not introduce payments, commissions/payouts, breaking API changes, destructive migrations, major dependencies, hosting changes or substantial new workflows without approval.

## Current implementation

- `app/routes.ts` defines routes; `app/routes/api.ts` exposes `/api/v1/*`; domain/API code lives in `app/.server`.
- MongoDB/Mongoose server auth uses opaque HttpOnly cookie sessions and scrypt passwords. Browser demo uses jose JWTs, browser-owned signing key and PBKDF2 hashes in localStorage. Demo identity is not server-trusted. No SQLite account persistence.
- Google sign-in is an additional server-only code/PKCE method using oauth4webapi and the same cookie sessions. AuthIdentity maps verified subjects to Users with unique indexes; OAuthTransaction holds one-use state/nonce/verifier data. Never auto-link by email. Linking requires an existing session and fresh password check. Keep credentials server-only; see `docs/google-auth.md`.
- With no MongoDB, demo is development-default or explicitly `DEMO_MODE=true`; disabled demo gives read-only preview. Business/delivery/charter persistence still requires MongoDB.
- Reuse existing User, Business, Membership, Farmer, Product, Livestock, Departure, Booking, Trailer, Reservation, Delivery and quote models. Business memberships and operational permissions are separate from authentication identity. Businesses may offer multiple services.
- Money uses integer ZAR cents. Validate inputs with Zod; preserve `{data}`/`{error}` API contracts and ownership/origin protections.
- User listing details persist in MongoDB; uploaded listing images must persist in GridFS (`images.files`/`images.chunks`). Listing create/update accepts only `/media/images/<ObjectId>` references, verifies the file exists and belongs to the business, and rejects external URLs/base64 image storage. Preserve the file-upload workflow; do not reintroduce an external URL bypass. Private document storage remains a separate concern. See `docs/images.md`.
- `/admin/businesses` requires a current server-verified User.admin role. User.superAdmin additionally permits `/admin/users` and regular admin role changes; regular admins cannot grant roles. Website role changes cannot modify super admins. Business verification writes BusinessReview audit records transactionally. Provision super admins only using trusted `scripts/admin.ts --super-admin`; never bootstrap roles from public registration, browser identity or matching email. See `docs/admin.md`.
- Super admins use the dedicated `/admin` overview and administration-only Shell. Root navigation redirects their customer-page visits to `/admin`; keep customer promotions/listings out of this workspace. This UI routing does not replace server permission checks.
- `/support` is reporter-owned complaint handling; `/admin/support` is shared by both admin roles. Internal notes must be filtered server-side. Transaction linking requires customer ownership or business membership, independent of verification. Status/history updates are atomic and version-checked; see `docs/support.md`.
- The customer support popup uses those same APIs. Socket.IO `/support` authenticates real cookie sessions and rechecks role/session before emitting opaque IDs to staff/the reporter. Never trust demo room IDs for support or send message text/private notes in socket signals. Process-local events have periodic API refresh fallback; no durable cross-instance push is implemented.
- Seat/stock changes require conditional writes and transactions. Trailer conflict checks use a shared calendar write inside a transaction; an availability boolean is insufficient. Current trailer creation is a request, not instant confirmation.
- Taxis default to 15 passenger seats (driver excluded), with lower capacities allowed. Seat writes enforce this ceiling. Overflow uses a real next scheduled vehicle on the same operator/route/fare, keeps groups together and snapshots actual allocation/time. Never invent vehicles or silently change fares. New same-instant duplicate vehicle schedules are serialized using scheduleVersion. See `docs/BOOKING_ENGINE.md`.
- Provider service tools require a verified active business and matching type as well as membership. `/business/:id/tools` exposes matching service tabs; business type changes reset verification. Preserve direct customer eligibility checks and verified public discovery filters. See `docs/business-tools.md`.
- Demo bookings are per-account localStorage, Web Locks protect same-origin/account writes, and Socket.IO broadcasts opaque-room refresh signals only. This is not multi-user authoritative inventory.
- Trailer payments go directly to providers; stored reports are `business_reported`, never independently verified payments. Do not promise guaranteed delivery speeds.

## Workflow and verification

Read relevant existing documentation and implementation first. Separate implemented behavior from product intent. Prefer small demonstrated fixes, regression tests and accurate documentation over speculative features. Do not overwrite useful docs or include secrets/customer data.

Use `npm run typecheck` and `npm test` (build plus Jest). `npm run test:jest` needs an existing build for API/runtime tests. On Windows use `npm.cmd` if PowerShell blocks npm.ps1. No lint command is currently configured. Unit/smoke tests do not establish real MongoDB concurrency, browser UX or production readiness. Database integration needs a dedicated replica set, never an unapproved destructive reset.

Start with [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md), [docs/BOOKING_ENGINE.md](docs/BOOKING_ENGINE.md) and [docs/ROADMAP.md](docs/ROADMAP.md). Product direction is in [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md); model relationships are in [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
