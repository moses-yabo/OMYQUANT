# Current data model

The authoritative schema definitions are in `app/.server/database/models.ts`; API validation is in `modules/resources.ts`, `shared/http.ts` and `api.ts`. Mongoose schemas use timestamps and strict unknown-field rejection (except the login-attempt schema, which uses its own options). API validation is often stronger than schema-level constraints: direct database writes must not bypass domain invariants.

| Actual model | Main relationships and purpose |
| --- | --- |
| User | Name, unique email, optional hidden passwordHash (Google-only accounts have none), active flag, admin and superAdmin flags; super admins can manage regular admin access |
| BusinessReview | Business, reviewer User, verified decision, optional reason and timestamps; created transactionally with verification changes |
| AuthIdentity | User + provider + providerUserId; unique provider/subject pair and user/provider pair; currently Google only |
| OAuthTransaction | Unique opaque-cookie digest, state/nonce/PKCE verifier, login/link intent, optional linking user/session digest and explicit ten-minute expiry/TTL |
| Session | User, unique digest of opaque cookie token, expiresAt with TTL index; authorization checks expiry explicitly |
| LoginAttempt | Unique email-digest/time-bucket key, count and TTL expiry |
| Business | Multiple service types, contact, locations, verified/active flags; independent provider identity |
| Membership | Business + User with owner/manager/staff role; unique compound pair; actual equivalent of conceptual BusinessMembership |
| Farmer | Unique Business relation plus profile name/description/location; actual equivalent of FarmerProfile |
| Product | Business, quantity, price/currency, unit/category, images/location and draft/published/inactive status |
| Livestock | Same listing fundamentals plus animal category, breed, age, sex and health document URLs |
| Order | Customer + Business, embedded listing/kind/name/quantity/unit-price snapshots, total, fulfilment/status, optional Delivery relation, external-unverified payment label |
| Driver | Business + User and licence document URLs |
| Vehicle | Business, globally unique registration, passenger capacity (API defaults/max 15), scheduleVersion for same-time scheduling coordination, document URLs and optional Driver |
| Route | Business, local/long_distance mode, name/stops, scheduled flag |
| Departure | Business + Vehicle + Route, start time, capacity/remaining/price snapshots and trip status |
| Booking | Customer + Business + actual allocated Departure, seats, unit price, vehicle and departure-time snapshots; confirmed/cancelled; legacy records may lack vehicle/time |
| Trailer | Business, dimensions/payload, dailyPrice/location/images/documents, active flag and calendarVersion |
| Reservation | Customer + Business + Trailer, start/end, total/status, pickup/return timestamps and one externalPayment report; actual TrailerReservation |
| Delivery | Customer, optional Order and assigned Business, pickup/dropoff, parcel/agricultural/livestock type, dimensions/weight, requirements/status and proof URL |
| Quote | Delivery request + Business, price, declared capabilities and offered/accepted status |
| TransportRequest | Customer, staff/charter/private_minibus kind, passenger count, locations/time and status |
| TransportQuote | TransportRequest + Business, price/description and offered/accepted status |
| Category | Unique name, description and active flag; directory separate from the fixed product API category enum |

One Business can offer `farm`, `taxi_operator`, `trailer_rental`, `logistics` and/or `commercial_transport`. Ownership/operations come from Membership, not from changing a User's authentication identity. Do not create duplicate FarmerProfile, PassengerBooking or TrailerReservation collections just to match conceptual names.

Money is integer ZAR cents; quantities are integers through the API. Dates are BSON dates/ISO API values. Location contains address, province and optional coordinates. Core IDs are ObjectIds; returned booking/reservation IDs serve as references. Documents are URL strings, not managed secure uploads.

Listing image arrays additionally accept `/media/images/<ObjectId>` references. GridFS bucket `images` stores binaries in `images.files` and `images.chunks`; file metadata records owning business and validated content type. Public visibility is resolved from the owning business and referencing published listings/active trailers, rather than a permanent public flag on the file. Private document fields remain separate. See [image storage](images.md).

Important indexes include email, session digest/TTL, login bucket/TTL, membership pair, farmer business, vehicle registration, category name, and the reservation trailer/status/start/end compound index. Provision/verify indexes before traffic; the overlap index is not a uniqueness constraint. Calendar version writes and transactions provide trailer conflict coordination.

MongoDB references do not supply foreign-key enforcement. Domain handlers validate selected business/user/route/vehicle relations; not all provider eligibility, document access and lifecycle policies are complete. No Notification, ParcelService, audit log, maintenance calendar, payment ledger or dedicated parcel-to-departure relationship currently exists. Add models only after agreeing requirements and checking whether existing entities can be extended.

Browser demo accounts/JWTs and bookings are separate JSON/localStorage structures, documented in [local-auth.md](local-auth.md) and [local-bookings.md](local-bookings.md). They are not MongoDB schemas, migrations or a shared production datastore.
