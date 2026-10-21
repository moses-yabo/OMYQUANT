# Phased roadmap

This is a proposed sequence, not authorization to implement new workflows. Preserve the current UI and modular monolith.

## 1. Establish reliable evidence

- Maintain architecture/feature documentation against code and retain existing browser demo behavior.
- Add a dedicated disposable MongoDB replica-set integration suite for authorization, business ownership, order stock, competing seat bookings, trailer conflicts, cancellation and rollback/retry. Select test infrastructure explicitly; never run destructive fixtures against customer data.
- Review public versus private API field projections, inactive-provider behavior, schema constraints, error mapping and indexes. Fix demonstrated defects with regression tests.
- Add browser verification of existing authentication, ordering and responsive flows without redesigning them.

## 2. Agree booking operating rules

Clarify instant trailer confirmation eligibility, cancellations/cutoffs, deposits paid directly to providers, maintenance/blocked dates, late returns, suspension behavior and vehicle schedule collisions. Define idempotent request semantics and any hold/expiry requirements. Then approve an instant-trailer workflow and any necessary UI copy changes. See [BOOKING_ENGINE.md](BOOKING_ENGINE.md).

## 3. Complete existing provider operations

Plan business staff permissions, fleet/departure management, trailer operations, listing lifecycle and logistics quote handling around the existing entities. Provider management screens require UI approval. Plan durable notifications and audit trails before promising automated updates. Secure uploads need an agreed storage/access/retention design and approval for new infrastructure.

## 4. Connect parcel services to the transport network

Agree participating operators, parcel restrictions/capacity, route/departure links, local versus interprovincial coverage, collection/handoff responsibility, tracking and evidence of delivery. Reuse Delivery/Quote/Route/Departure where appropriate. Generic quote requests do not yet provide this service. This is a substantial workflow requiring approval; do not promise fixed delivery speeds.

## 5. Prepare wider launch

Validate server-backed authentication and shared inventory end to end; decide recovery/email verification, provider verification and operational support policies. Browser demo accounts do not become trusted server accounts automatically. Deployment changes, major dependencies, breaking contracts, migrations, payment processing and separate applications/services all require explicit approval. Future separate division experiences should share appropriate identity and business infrastructure.
