# Optional businesses under one account

Business registration is optional. Authentication, server sessions, customer orders, bookings and trailer reservations are unchanged. Business ownership never changes User.admin or User.superAdmin. A user can own or join multiple businesses and continue shopping personally.

## Registration and switching

**My businesses** (`/business`) lists the current user's memberships, independent application statuses, profile links and approved service dashboards. The registration form can be used repeatedly. It requires contact/location details, a business type and one to five private PDF/image verification documents (5 MiB per file). Documents may combine the evidence requested for the selected type. Customers select **Return to personal marketplace** to shop normally.

`app/lib/business-registry.ts` centrally maps public business kinds to the existing stored service keys. LIVESTOCK_FARMER and AGRICULTURAL_SELLER both enable the farm service, as both can manage produce, supplies and livestock. TRAILER_RENTAL, TAXI_OPERATOR and LOGISTICS_PROVIDER enable their respective services. The existing commercial transport option and multi-service businesses remain supported.

Approved dashboards at `/business/:id/tools` contain a business selector. Selection is a URL, never a globally trusted browser role or permission. Every loader/action and API operation rechecks access to the selected business. Profiles/team management are at `/business/:id/profile`; owners can pause/resume their business. A paused business remains private until resumed and approved.

## Verification

Each new application stores owner, PENDING verification status and verified:false. Admin and super admin use the existing review queue to choose PENDING, UNDER_REVIEW, APPROVED, REJECTED or SUSPENDED. Notes can request additional information. Rejection/suspension requires a reason. Owners can replace evidence and resubmit for review. Changing service types or submitting new evidence resets approval. Owners/members who also hold platform admin access cannot review a business they belong to.

Decision status, reviewer, time and reason are recorded in the Business and BusinessReview audit in the same transaction. Admin role changes through the website also write an AdminAccessReview audit transactionally. Public discovery, listing images and direct order/booking/reservation eligibility require an active approved provider. Returning a business to review, rejecting or suspending it hides listings without deleting historical transactions. Listing inactivity is the supported way to remove an offer from the marketplace while preserving order history.

Verification files use a separate **verificationDocuments** GridFS bucket, not the public listing-image bucket. `/business/documents/:id` requires authentication and allows the business's current owners/managers or platform reviewers to download evidence. Responses are private, no-store, sandboxed attachments. File IDs and names are validated; client-supplied roles, approval flags, and references to another user's uploads are rejected. Listing photographs continue to use `images.files`/`images.chunks` and their existing business ownership checks.

## Business permissions

Owners administer their business profile and memberships. Managers manage all the business's enabled service operations. Staff have **no service permissions by default**; owners assign service read/write permissions in the business team form. A write grant includes the corresponding read grant. Permissions cannot enable a service the business does not offer or grant platform roles. Existing staff should have their required permissions reviewed by an owner after deployment. Existing owner/manager memberships remain valid.

Staff navigation and mutation controls follow their permissions; backend checks remain authoritative. A manager/staff membership cannot administer memberships or change platform roles. Platform admins retain the existing administrative access, independently of business membership.

Drivers are represented by the existing Driver → User relationship. They do not need business management membership. Operators assign driver profiles to vehicles; delivery businesses assign their personnel/vehicles to accepted jobs. **My driver assignments** (`/work`) exposes only the current user's assigned trips and deliveries, with narrow start/complete/collect/deliver transitions. It grants no fleet, listing, customer-order or admin access. Current assignment lists are capped at 100 records per kind.

## Service tools

- Farms: listings, stock/price edits, publication/inactivity, GridFS listing photos, orders and customer enquiries. Customers use **Ask the seller** on a live listing and view replies at `/enquiries`. Replies are scoped to the relevant seller.
- Rentals: trailer dimensions/payload/photos, active/inactive listings, daily and optional hourly/monthly rates, reservation decisions and rental history. Rates use integer ZAR cents. Requested rentals snapshot the selected price; billable periods round up. A rental month is explicitly 30 days. Customers pay the independent provider directly. Existing transactional calendar conflict checks remain in place when confirming reservations.
- Taxi operators: vehicles, driver profiles/assignment/availability, routes, departures and passenger bookings. Capacity remains at most 15 passengers, with overflow to the next eligible scheduled taxi. Changing fleet availability does not automatically cancel existing trips; operators must manage those departures explicitly.
- Logistics: delivery vehicles/personnel, profile service areas/base/per-kilometre prices/availability, request summaries and explicit quote offers, assigned deliveries, personnel assignment and delivery status/proof. Open requests expose provinces/goods/weight to approved providers, not customer identity or full addresses. Customers review and accept quotes through **My activity → View delivery quotes**; an accepted quote assigns the job. Pricing settings guide provider quotes; they do not automatically compute route distance or charge payments. Assigned personnel can perform only their assigned delivery transitions.

## Compatibility and deployment

No collections are renamed, and no accounts, sessions, inventory, bookings or Google identities are migrated. Existing `types` values remain the service keys. Existing records without verificationStatus read as APPROVED when verified:true, otherwise PENDING. New decisions dual-write status and the compatibility verified flag; public queries also check explicit status. Existing businesses do not need to register again. All new registrations require uploaded verification evidence; JSON clients must supply their own existing private document references.

New schema fields, indexes, enquiry/audit collections and the private GridFS bucket are additive. No production data migration, seed, role grant or automatic verification is run by this change. Deploy the code and review staff grants and legacy business evidence using the administrative workflow. Authentication is unchanged: this checkout has no registration email OTP implementation, and this work does not introduce OTP on login or replace email/password/Google sign-in.

Run `npm run typecheck` and `npm test`. Tests cover multi-business registration and ownership, verification lifecycle, staff permission boundaries, private document access, customer rental eligibility, rental rates and driver assignment scoping, alongside existing authentication and trailer-conflict tests. Persistence tests use mocks; live Atlas transaction/concurrency and full browser/OAuth checks remain required before production acceptance.
