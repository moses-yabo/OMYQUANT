# Booking engine: actual behavior and intended direction

## Current authoritative backend

Provider tools require an active, verified business, matching service type and business membership (or platform admin). Public discovery and new orders/seat bookings/trailer requests require the corresponding verified provider. See [business tools](business-tools.md) for workflow, withdrawal behavior and concurrent provider-state limitations.

`app/.server/modules/inventory.ts` uses `mongoose.connection.transaction()`. A MongoDB replica set/Atlas and appropriate indexes are prerequisites. Transaction code exists; real concurrent behavior is not established by the current mock/local tests.

**Passenger seats:** taxis default to 15 passenger seats, excluding the driver, with smaller capacities allowed. New vehicle inputs and booking parties are capped at 15. `bookSeats()` conditionally decrements `Departure.remaining` only for a future scheduled departure that fits the whole group, enforcing a maximum of 15 booked passengers (or the smaller departure capacity). If the selected taxi cannot fit the party, it atomically allocates the next separately scheduled vehicle for the same business and route, at the same fare and no earlier than the selected departure. Candidates sort by departure time then ID. It does not split groups, invent vehicles or increase fares. If none fits, it returns 409 and asks the customer to choose another departure. A later departure time is disclosed in the reservation form and shown in the confirmation and customer activity.

The operator must be active and verified, and allocation plus `confirmed` Booking creation use the same inventory transaction. Errors must abort all seat changes. The booking stores its actual departure, vehicle, time and price snapshot; old bookings may lack the newer vehicle/time fields. Cancellation restores seats to the actual allocated departure. Public discovery hides full taxis; stale booking forms can use the allocation fallback. Vehicle creation defaults to 15 seats and departure creation caps legacy larger vehicle capacities to 15. An existing departure is not rewritten; the conditional booking ceiling and public availability calculation prevent further seats beyond the cap. Existing bookings are not cancelled or moved automatically.

Scheduling writes the vehicle's scheduleVersion within a transaction and rejects a second non-cancelled departure for that same vehicle at the exact same instant. This prevents new duplicate seat pools at one departure time, but is not a full journey-duration conflict check and does not repair historical duplicate schedules. Capacity and price remain departure snapshots. Departure cancellation retains booking records; downstream history/notification handling needs improvement. Real competing allocation, transaction retry and rollback behavior still require replica-set integration tests.

**Farm orders:** conditional stock decrements, seller checks, price snapshots and order creation share a transaction. Mixed-seller orders are rejected. Eligible cancellation restores stock transactionally unless a linked delivery needs resolution. This is order placement, not verified payment.

**Trailer rentals:** creation writes a `requested` Reservation and snapshots price for `ceil(duration / 24 hours)` days. It does not secure availability. Provider confirmation in `changeReservation()` increments the shared Trailer `calendarVersion` and checks overlapping `confirmed`/`picked_up` intervals within a transaction. Writers to the same trailer conflict and must retry through the transaction machinery. Intervals are half-open: `[start, end)`, so adjacent return/pickup timestamps are allowed. `active` alone is not conflict protection. Customer date forms currently use 08:00 South African time. Existing transitions are:

- `requested` -> `confirmed`, `rejected` or `cancelled`.
- `confirmed` -> `cancelled` or `picked_up`.
- `picked_up` -> `returned`.

Customer cancellation is ownership-checked; provider transitions require business access. The implementation also requires an active trailer for transitions, so cancellation/return of a subsequently deactivated trailer needs follow-up. Returned reservations no longer block intervals; late-return handling and actual pickup conflicts are not fully modeled. There are no blocked maintenance periods, deposit/eligibility policy, reservation expiry or idempotency keys.

## Instant confirmation target

Passenger confirmation already follows the intended transactional pattern, subject to integration verification. Trailer instant confirmation is a workflow change and has **not** been implemented. Before enabling it:

1. Agree provider operating conditions, rental eligibility, cancellation rules, date/time semantics, maintenance blocks and late-return behavior.
2. Validate trailer and active provider eligibility, dates and pricing on the server.
3. Serialize calendar changes and check conflicting reservations in the same transaction that creates a confirmed reservation. Preserve a shared write conflict point; a standalone overlap read or availability boolean is insufficient.
4. Return confirmation/reference only after successful commit. Add request idempotency to handle retries without duplicate bookings.
5. Test competing requests, adjacent intervals, cancellation/confirmation races, rollback, retry and provider deactivation against a dedicated replica set.
6. Decide whether temporary holds are needed. If introduced, define expiry and authoritative release logic; do not rely solely on background TTL cleanup.

Changes to customer confirmation language/screens or the provider approval workflow require explicit approval. The existing UI and URLs remain preserved.

## Browser demonstration

`local-booking-store.ts` simulates stock, seat confirmation and manual trailer transitions. Web Locks in `local-bookings.ts` serialize changes within one account's localStorage key across tabs. Different accounts, browsers and devices have independent inventory. Socket.IO sends refresh signals only; it is not a shared booking database. A browser `confirmed` status never proves that a real operator accepted or secured anything.

## Payments and unresolved decisions

Customers pay independent trailer businesses directly. The external payment API stores one report with amount, reference, reporter and timestamp, labeled `business_reported`. It is neither independently verified nor a payment gateway. No commission or payout system exists.

Business decisions still needed: cancellation cutoffs and charges, provider suspension effects, driver/vehicle scheduling policy, seat holds if any, trailer eligibility/collection conditions, deposits, late returns, parcel capacity and collection responsibility. No guaranteed delivery speeds should be inferred from passenger departure times.
