# OMYQUANT client

Customers and business members can report and track complaints at `/support`; both admin roles review and reply at `/admin/support`. My activity transaction cards pre-fill references. See [support workflows](support.md).

The client uses the existing React Router Framework Mode app. Run `npm run dev` and open the printed local URL. It shares a deployment and session cookie with the server resource routes; no separate client API origin is required.

## Screens and flows

- `/`: responsive marketplace with category tabs, text search, province filter, price sorting, saved listings and listing detail dialogs. Saved references persist in this browser's local storage. Agricultural items place orders, taxi departures reserve seats, and trailers submit reservation requests through `/reserve`.
- `/login` and `/register`: in MongoDB mode, server validation and HttpOnly cookie sessions; in browser demo mode, client validation and localStorage jose JWT sessions. Existing pending states and redirects are preserved.
- Google sign-in adds an accessible button to those existing forms, disabled with a setup hint until configured. An authenticated password user can reauthenticate and explicitly link Google on the same page. No new page design or global style change is introduced; see [Google setup](google-auth.md).
- `/account`: customer order, seat booking, trailer reservation, delivery and charter history. Eligible orders/bookings/reservations can be cancelled. The backend enforces final cancellation eligibility.
- `/request/delivery`: parcel, agricultural goods and specialist livestock delivery requests, with an optional farm order reference.
- `/request/transport`: staff, charter and private minibus transport requests. Times are interpreted in South African time.
- `/business`: independent business onboarding and membership business list. Verified active businesses show **Manage business**, opening `/business/:id/tools` with tools for their services. The harvest form is restricted to verified active farms. See [business tools](business-tools.md).

Loaders and actions call the existing domain API on the server through `app/.server/frontend.ts`; this is an internal function call rather than an HTTP request to a self-reported host. The original request's session cookie and origin headers are preserved. Form actions validate browser origin before processing. API error details are shown without exposing stack traces.

## Preview and live data

If `MONGODB_URI` is absent, local development enables [browser-only demo accounts](local-auth.md) and [sample bookings](local-bookings.md), all persisted in localStorage. Orders, seats and trailer reservations can be reviewed and cancelled in My activity, and trailer business approval/pickup/return can be simulated. Business/request persistence still requires MongoDB. Set `DEMO_MODE=false` to use a read-only catalog preview. Production requires `DEMO_MODE=true` for browser demo mode. Configuring MongoDB selects the real backend instead.

Search and province filters are applied to live agricultural/trailer API queries; taxi route text filtering is applied to loaded departures. Pagination retrieves up to 100 records per service per page. Saved listings are references, not offline inventory, so saved records must appear in the loaded page to be displayed. The supplier directory and more advanced provider discovery remain future work.

Typography uses Inter with system fallbacks. Preview imagery loads from Unsplash, except the local trailer illustration in `public/images/trailer.svg`. If an external image is unavailable, the card retains its dimensions; live listings without images use a local icon placeholder. No external image is treated as evidence of a real supplier or vehicle.

The existing product form accepts a PNG/JPEG/GIF/WebP upload up to 5 MiB. Listing data saves in MongoDB, and uploaded images save in GridFS and are served by `/media/images/:id`. External image URL entry is no longer offered. Listing create/update APIs require existing GridFS image references belonging to the same business. Seeded MongoDB listing images can be migrated with `npm run images:migrate-samples`. See [image storage](images.md) for visibility rules and migration verification.

## Verification and remaining work

Run `npm run typecheck` and `npm test`. Tests cover resource routing, preview server rendering, frontend routes, unknown-route handling, and mutation origin checks. This session had no browser automation tool or configured MongoDB, so browser interactions, responsive screenshots and authenticated database workflows require follow-up validation.

The client includes customer discovery, core requests, business onboarding and verified service tools for farming, livestock, trailer rentals and taxi scheduling. Admin business verification and super admin role-management screens are available. Logistics/charter quote forms and business staff management remain future UI work. Changes are saved locally and are not automatically published to hosting.
