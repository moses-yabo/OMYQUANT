# Capability assessment

Audited 20 October 2026. **Working** below means supported by the listed repository tests or directly inspectable behavior, within the stated mode. MongoDB workflows have not been verified against a live replica set in this audit.

| Capability | Classification | Evidence and limits |
| --- | --- | --- |
| Browser registration/login/JWT persistence | Implemented and working (demo) | `browser-auth.ts`, `auth.test.mjs`; browser-owned signing key, not trusted server identity |
| MongoDB registration/login/session/logout | Implemented but requiring improvement | `modules/auth/auth.ts`, API auth handlers; no authenticated database integration tests; recovery/verification missing |
| Admin business review | Implemented but requiring improvement | Server role-protected `/admin/businesses`, operator grant/revoke command, transactional verification history; live transaction/browser integration checks remain |
| Customer and business complaints | Implemented but requiring improvement | Reporter-owned `/support`, both admin roles at `/admin/support`, private-note filtering, public replies and atomic status/history; no evidence uploads or support push/email notifications; integration checks remain |
| Google sign-in and explicit account linking | Implemented but requiring improvement | `modules/auth/google*.ts`, resource routes and `google.test.mjs`; actual OAuth/signature validation with test keys, mocked persistence; Google credentials and live replica-set/browser verification still required |
| Business identity and scoped membership | Partially implemented | Owner/manager/staff, multi-service business, verified service tools at `/business/:id/tools`; matching service and verified status enforced server-side; live integration checks remain |
| Farm profiles, produce/feed/livestock | Partially implemented | `modules/resources.ts`, API, `marketplace.ts`; separate Mongo products/livestock, sample catalog works; no full seller directory or livestock management UI |
| Discovery/search/location/prices/saved listings | Implemented but requiring improvement | `home.tsx`, API list helper; saved IDs browser-local, limited to loaded page; departure search partly client-side |
| Farm orders and stock restoration | Partially implemented | `inventory.ts`, API order status transaction; single-seller baskets and snapshots; Mongo concurrency tests missing |
| Long-distance taxi seats | Partially implemented | `bookSeats`, `cancelBooking`, Departure/Route/Vehicle; backend conditionally secures seats and creates confirmed booking transactionally; no real database concurrency verification |
| Taxi fleet/departure management | Partially implemented | Resource APIs and departure handlers; no provider UI, vehicle schedule collision protection or departure driver snapshot |
| Trailer discovery and reservation requests | Implemented but requiring improvement | Reservation API, `changeReservation`, local demo tests; manual confirmation, half-open date intervals, calendar-version serialization |
| Instant trailer confirmation | Missing | Creation returns `requested`; only later provider confirmation checks conflicts. Requires approved workflow and operating rules |
| Cancellation/expiry/provider conditions | Requires business clarification | Existing state transitions enforce limited cancellation; cutoff/fees, holds/expiry, rental eligibility and late-return policy not defined |
| Local/interprovincial parcel requests | Partially implemented | Delivery/Quote API and `/request/delivery`; generic pickup/dropoff and provider quotes; no delivery-speed promises |
| Taxi-network parcel service discovery | Missing | No parcel service/departure capacity entity or parcel-to-taxi-route relationship; generic delivery workflow is not this capability |
| Specialist livestock delivery | Partially implemented | Order link and goods type checks, verified logistics business and declared capability; no regulatory/document verification workflow |
| Charter/staff/private minibus requests | Partially implemented | TransportRequest/TransportQuote API, `/request/transport`; assignment records accepted quote, no complete provider operations UI |
| External trailer payment reports | Partially implemented | Reservation externalPayment endpoint records `business_reported`; one report, no ledger or independent verification |
| Browser activity and realtime refresh | Implemented and working (demo) | `bookings.test.mjs`, local store and Socket.IO; per-account local data, room-isolated signals, no cross-device inventory |
| Browser submission notifications | Implemented but requiring improvement | Opt-in customer alerts after successful order/seat/reservation submission; TypeScript service worker and activity links; OS/browser interaction needs manual verification |
| Durable customer/provider notifications | Missing | Browser submission alerts are not durable delivery; no Notification model, outbox, Web Push, email/SMS delivery or authenticated domain socket events |
| Secure document uploads/audit logging | Missing | URL fields only; no upload/access pipeline or audit model |
| GridFS listing images | Implemented but requiring improvement | Product form uploads, bounded/signature-checked raster files and permission-aware GET/HEAD; 13 seeded Atlas images migrated and resource reads verified; quota/retention/scanning/resizing remain future work |
| API validation and pagination | Implemented but requiring improvement | Zod schemas, bounded lists, origin/JSON checks and normalized errors; database errors commonly map to 503, no total-count metadata |
| Automated verification | Partially implemented | Jest, TypeScript and build scripts; browser, database integration and concurrent transaction coverage missing |

Prioritise reliability and integration evidence over adding more workflows. [ROADMAP.md](ROADMAP.md) separates safe internal work from changes requiring approval.
