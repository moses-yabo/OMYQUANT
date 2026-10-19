# OMYQUANT client

The client uses the existing React Router Framework Mode app. Run `npm run dev` and open the printed local URL. It shares a deployment and session cookie with the server resource routes; no separate client API origin is required.

## Screens and flows

- `/`: responsive marketplace with category tabs, text search, province filter, price sorting, saved listings and listing detail dialogs. Saved references persist in this browser's local storage. Agricultural items place orders, taxi departures reserve seats, and trailers submit reservation requests through `/reserve`.
- `/login` and `/register`: account forms with server validation, pending states and cookie forwarding after login. Sessions remain HttpOnly.
- `/account`: customer order, seat booking, trailer reservation, delivery and charter history. Eligible orders/bookings/reservations can be cancelled. The backend enforces final cancellation eligibility.
- `/request/delivery`: parcel, agricultural goods and specialist livestock delivery requests, with an optional farm order reference.
- `/request/transport`: staff, charter and private minibus transport requests. Times are interpreted in South African time.
- `/business`: independent business onboarding, membership business list and agricultural product creation for farm businesses. Business service types can be combined.

Loaders and actions call the existing domain API on the server through `app/.server/frontend.ts`; this is an internal function call rather than an HTTP request to a self-reported host. The original request's session cookie and origin headers are preserved. Form actions validate browser origin before processing. API error details are shown without exposing stack traces.

## Preview and live data

If `MONGODB_URI` is absent, local development enables [browser-only demo accounts](local-auth.md) and [sample bookings](local-bookings.md), all persisted in localStorage. Orders, seats and trailer reservations can be reviewed and cancelled in My activity, and trailer business approval/pickup/return can be simulated. Business/request persistence still requires MongoDB. Set `DEMO_MODE=false` to use a read-only catalog preview. Production requires `DEMO_MODE=true` for browser demo mode. Configuring MongoDB selects the real backend instead.

Search and province filters are applied to live agricultural/trailer API queries; taxi route text filtering is applied to loaded departures. Pagination retrieves up to 100 records per service per page. Saved listings are references, not offline inventory, so saved records must appear in the loaded page to be displayed. The supplier directory and more advanced provider discovery remain future work.

Typography uses Inter with system fallbacks. Preview imagery loads from Unsplash, except the local trailer illustration in `public/images/trailer.svg`. If an external image is unavailable, the card retains its dimensions; live listings without images use a local icon placeholder. No external image is treated as evidence of a real supplier or vehicle.

## Verification and remaining work

Run `npm run typecheck` and `npm test`. Tests cover resource routing, preview server rendering, frontend routes, unknown-route handling, and mutation origin checks. This session had no browser automation tool or configured MongoDB, so browser interactions, responsive screenshots and authenticated database workflows require follow-up validation.

The initial client covers customer discovery and core requests, plus business onboarding/product creation. Provider management screens for taxi fleet scheduling, trailer approval/pickup/return, logistics and charter quotes, business staff management and platform administration are not included in this pass. These backend endpoints remain available for subsequent management screens. This work is saved in the local repository and has not been published to external hosting.
