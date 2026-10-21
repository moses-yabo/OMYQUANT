# OMYQUANT server modules

Without MongoDB, [demo accounts, sessions and bookings use browser localStorage](local-auth.md). No SQLite backend is used. The MongoDB authentication implementation described below remains available when `MONGODB_URI` is configured.

This repository began as a React Router Framework Mode starter, not the legacy Siyaya backend described in the attachment. There were no existing backend controllers, schemas, or routes to migrate. Following the clarified requirement, the backend uses React Router resource routes, loaders and actions in the same deployment as the frontend. The installed React Router version is 8; it has not been downgraded to version 7.

`app/routes/api.ts` is the `/api/v1/*` resource route. It has no component. All database, authentication and business logic lives in `app/.server/`, which React Router excludes from the browser build. Existing frontend routes and Docker deployment remain available.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`, then set `MONGODB_URI` to an Atlas connection string and `APP_ORIGIN` to the exact public application origin.
3. Start with `npm run dev`. Vite loads `.env` in development. Production must inject these environment variables through the deployment environment.
4. Run `npm run typecheck` and `npm test` (production build plus Jest). Use `npm run test:jest` only when the build is already current.

Atlas or a local replica set is required for transactional workflows. A standalone MongoDB server cannot execute them. Ensure indexes exist before accepting traffic, particularly unique email, membership, registration, session digest and login throttle indexes. The deployment needs database index creation permissions during provisioning. No Redis, queues, payment gateway or separate Express server is required.

Connection configuration supports either a complete `MONGODB_URI`, or an Atlas URI template with `<db_username>` (legacy literal `username` is also supported) and `<db_password>`, plus `MONGODB_DB_USERNAME` and `MONGODB_PASSWORD`. Set both separate credential variables together. For a template, credentials are encoded into the URI once, without duplicate driver authentication options. For a complete URI, separate variables retain their raw driver-option override behavior. Keep separate credential values raw, not percent-encoded. Invalid schemes and unresolved placeholders are rejected before connecting. Quote credentials in `.env` so `#` is preserved, and escape literal dollar signs as `\$` for Vite's environment expansion. Optional `MONGODB_DB_NAME` selects the application database without rewriting the authentication source. Vite loads these settings server-side; restart the development server after changes. Never print a connection string or raw driver error to troubleshoot credentials.

## Authentication and safety

Google is an additional server authentication method, through POST `/auth/google` and GET `/auth/google/callback` (outside `/api/v1`). It uses authorization code + PKCE, one-use server transactions, verified ID tokens and the same existing session cookie. Google-only users have no password; existing password users can explicitly link Google after password reauthentication. Matching emails alone never link accounts. See [google-auth.md](google-auth.md) for configuration, models/indexes, security behavior and verification limits.

Register with `POST /api/v1/auth/register`: `{ "name": "Example", "email": "person@example.com", "password": "a-long-unique-password" }`. Login at `POST /api/v1/auth/login` with email and password. The response sets an HttpOnly, SameSite=Lax cookie, with Secure enabled in production. Sessions expire after 12 hours without sliding renewal. Only a SHA-256 digest of the random session token is stored. Logout deletes the session immediately; TTL cleanup is not used as the authorization check. Disabled users cannot authenticate. Passwords use Node scrypt with random 128-bit salts; hashes are excluded from queries and registration responses.

Mutations accept JSON only (64 KiB maximum) and reject mismatched Origin and cross-site browser requests. Serve the production application exclusively over HTTPS and set APP_ORIGIN correctly behind a proxy. There is no cross-origin API access configuration: the frontend and backend share an origin. Login is limited to ten attempts per normalized email per 15-minute fixed window using database counters across application instances. Deployment ingress should additionally limit registration and general request volume; email-keyed throttling alone does not prevent distributed account spraying or registration abuse.

Public registration rejects unknown fields, including administrator permissions. Regular administrator assignment uses `PATCH /users/:id/permissions`, accessible only to an existing super administrator, or the `/admin/users` screen. Super administrator provisioning is an explicit server operator task using `scripts/admin.ts --super-admin`; there is no public bootstrap endpoint. Business memberships grant no platform administrator rights.

Typed provider operations require an active, verified business with the matching service and membership (or platform admin). Pending owners can still read/manage their profile and memberships. Updating business types resets verification. Public catalog queries include only verified matching providers; direct orders, seat bookings and trailer requests also check eligibility. Provider history queries with `business` validate the matching service. GET `/transport/departures?business=<id>` is an authenticated provider list including historical departures; without that parameter it remains public scheduled discovery. See [business tools](business-tools.md).

Money is integer South African cents; currency is ZAR. Dates are ISO timestamps. Quantities and seats are integers. All API paths below start with `/api/v1`. Successful results have `{data: ...}`; failures have `{error: {message, issues?}}`. Lists use `?page=1&limit=20`, maximum 100. Histories default to the current customer; authorized staff can use `?business=<id>`.

## Implemented endpoints

| Paths | Methods and behavior |
| --- | --- |
| `/health` | GET without database access |
| `/auth/register`, `/auth/login`, `/auth/logout` | POST |
| `/users/me` | GET authenticated user |
| `/users/:id/permissions` | PATCH `{admin: boolean}`, super admin only; protects super admin accounts |
| `/admin/users` | GET exact `email` lookup of an active account, super admin only |
| `/businesses` | POST creates business and owner membership atomically; GET owned/member businesses |
| `/businesses/:id` | GET member business details, PATCH business details/status by owner/admin |
| `/businesses/:id/memberships` | GET, POST `{user, role: manager or staff}`, owner/admin only |
| `/businesses/:id/memberships/:userId` | DELETE non-owner membership by owner/admin |
| `/businesses/:id/verification` | PATCH `{verified: boolean, reason?: string}`, platform admin only; transactional review audit |
| `/admin/businesses` | GET paginated admin queue; `status=pending|verified|all`, `q`, `page`, `limit` |
| `/admin/businesses/:id` | GET business and latest 50 review decisions, platform admin only |
| `/support`, `/support/:id` | Own complaint queue/create/detail/reply; optional transaction links require ownership or business membership |
| `/admin/support`, `/admin/support/:id` | Admin complaint queue/detail, status updates and public/private notes; see [support API](support.md) |
| `/farming/farmers`, `/farming/products`, `/farming/livestock` | GET published directory/listings, POST creates, PATCH `/:id` updates within business |
| `/farming/farmers/:businessId/dashboard` | GET seller listing counts, open orders and fulfilled order value |
| `/farming/categories` | GET categories, POST by platform admin |
| `/transport/drivers`, `/transport/vehicles`, `/transport/routes` | GET, POST, PATCH `/:id`; private driver/vehicle lists scoped to memberships |
| `/transport/departures` | GET future non-full departures; authenticated `business` query lists provider history. POST `{business, vehicle, route, startsAt, price}` snapshots up to 15 passenger seats and rejects duplicate scheduling of a vehicle at the same instant |
| `/transport/departures/:id/status` | PATCH `{status: departed, completed, or cancelled}` with transition checks |
| `/transport/bookings` | GET history, POST `{departure, seats}` (1–15); overflow uses next separately scheduled taxi for the same operator/route/fare, possibly later; returned Booking contains actual departure and time |
| `/transport/bookings/:id/cancel` | POST before departure, returns seats atomically |
| `/farming/orders` | GET history, POST `{items: [{listing, kind: product or livestock, quantity}], fulfilment: collection or delivery}` |
| `/farming/orders/:id/status` | PATCH accepted/fulfilled by seller, cancelled by customer/seller; cancellation restores stock transactionally |
| `/rentals/trailers` | GET, POST, PATCH `/:id` |
| `/rentals/reservations` | GET history, POST `{trailer, start, end}` snapshots rental price |
| `/rentals/reservations/:id` | PATCH `{status}` for business confirmation/rejection, customer cancellation, business pickup/return |
| `/rentals/reservations/:id/external-payment` | POST `{amount, reference}` by business; always marked business_reported |
| `/logistics/requests` | GET history, POST pickup/dropoff, goodsType, description, weightKg, dimensions, requirements, optional order |
| `/logistics/requests/:id/quotes` | GET by customer, POST `{business, price, capabilities}` by verified logistics business |
| `/logistics/quotes/:id/accept` | POST by request customer assigns provider transactionally |
| `/logistics/requests/:id/status` | PATCH collected/delivered by assigned business; delivery requires proof URL |
| `/business-transport/requests` | GET customer history, POST staff/charter/private_minibus request |
| `/business-transport/requests/:id/quotes` | GET by customer, POST price/description by commercial transport business |
| `/business-transport/quotes/:id/accept` | POST by customer, transactionally accepts one provider |

Full request definitions are in `app/.server/modules/resources.ts` and the endpoint handlers. Location objects contain address, province, optional latitude and longitude. Business types are farm, taxi_operator, trailer_rental, logistics and commercial_transport; a business can have several. Listings default to draft. Public collection reads only include published listings from active businesses. Staff write access requires an active business with the matching service type.

## Inventory and concurrency

Orders use conditional stock decrements and pricing snapshots inside one transaction. Mixed-seller baskets are rejected. Bookings use departure-level remaining seats, not vehicle capacity, and conditional decrements inside a transaction, with an active-operator check before creating the booking. Cancellation and stock restoration happen in the same transaction as status changes.

Rental confirmation updates a shared trailer calendar version inside the transaction before checking overlapping confirmed or picked-up reservations. Concurrent confirmations for the same trailer conflict and retry against the updated calendar. Rental intervals are half-open: a return at exactly the next pickup time is allowed. Requested reservations do not hold inventory. Rental payments are made directly to independent businesses and are never independently verified or processed by OMYQUANT.

Livestock listings are separate from products. Orders containing livestock require a livestock delivery type, and quotes require a verified logistics provider explicitly declaring the matching capability. Verification is a platform operator responsibility; this MVP does not independently inspect veterinary documents or regulatory eligibility.

## Remaining product work and validation limits

This is a server foundation and core workflow implementation, not a completed marketplace UI or a migration of the unavailable legacy project. Remaining work includes notification delivery, ownership transfer, password reset/email verification, document upload/access controls, richer trailer pricing and blocked calendar periods, provider search and formal capability verification. The current external payment endpoint stores one business-reported record, not an accounting ledger. A cancelled departure retains its passenger booking records; customer history should inspect trip status. Vehicle schedule conflicts are not yet enforced. Categories are a managed directory; product categories currently use the fixed MVP category enum.

Type checking, production bundling and HTTP boundary smoke tests can run without MongoDB. Database-backed behavior, transaction retry behavior and concurrency must be verified against a dedicated Atlas/local replica-set test database before release. Do not interpret successful compilation or smoke tests as database integration verification.

See [architecture](ARCHITECTURE.md), [feature assessment](FEATURE_MATRIX.md), [booking engine](BOOKING_ENGINE.md) and [data model](DATA_MODEL.md) for the audited implementation and product gaps. Trailer instant confirmation and taxi-route parcel capacity remain planned, not implemented. External document URLs need a public/private field exposure review before storing real private documents.
