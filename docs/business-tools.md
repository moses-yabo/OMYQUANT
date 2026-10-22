# Business service tools

Register a business under **My business**. Registration creates an owner Membership, not a platform admin role. While verification is pending, the owner can see the business and its status but cannot use service tools. An administrator verifies it under **Verify businesses**. Refresh My business, then select **Manage business**.

The `/business/:id/tools` screen uses the existing business membership and service types:

| Service | Tools |
| --- | --- |
| Farm | Create product/feed and livestock listings, publish/unpublish, review orders, accept/fulfil/cancel eligible orders |
| Trailer rental | Create/activate/deactivate trailers; review requested, confirmed, picked-up and returned reservations; confirm/reject requests, record pickup and return |
| Taxi operator | Create vehicles and routes, schedule departures, update departure status, review seat bookings |
| Logistics | Read assigned deliveries |
| Commercial transport | Read assigned transport requests |

A business offering several services gets all matching tabs. Customers retain their normal account; owner/manager/staff memberships provide business-scoped access. Existing membership permissions permit these operational roles equally. Platform admins may manage verified businesses, but verification is still required. No user can obtain access to another business by changing a URL or form record identifier.

Taxi vehicle forms default to 15 passenger seats (excluding the driver), with lower capacities supported. Schedule each additional taxi as a separate vehicle/departure. When a selected taxi fills, the booking service uses the next scheduled vehicle on the same operator/route and fare, keeping the group together. The actual departure time appears in confirmation and activity. No scheduled alternative means no new booking. See [seat allocation details](BOOKING_ENGINE.md).

Listings and activity paginate at 20 records per page. Departure creation loads the business's vehicles and routes. Times entered in the departure form use South African time. Money entered in rand becomes integer cents on the server. Listing photos use the existing signature-checked, bounded GridFS upload and business-owned image-reference checks. Trailer confirmation retains the existing transactional overlap check; requesting a trailer does not immediately reserve it.

Public discovery includes only active, verified businesses with the matching service type. Direct farm orders and seat bookings check provider eligibility within their inventory transaction. Trailer request creation also checks provider eligibility. Changing service types through the business API resets verification; an administrator must review the changed business again. There is no auto-verification of existing or seeded businesses.

Provider service access is checked server-side on every request, not just by hiding controls. Business profile and membership administration remain separate from verified service tools. Withdrawing verification blocks provider tools, including ongoing service status updates; administrators should review outstanding commitments first. Customer history and existing customer cancellation rules remain available. Browser demo behavior is separate and does not represent verified MongoDB providers.

Current limits: this screen does not edit listing descriptions/prices/stock after creation (the existing validated PATCH API remains available), manage staff, upload private documents or provide logistics/charter quote forms. MongoDB transaction mocks establish guards and transaction participation, not real rollback/concurrency. Simultaneous verification/type changes and customer operations do not share a provider-state write lock; dedicated replica-set race testing remains needed. Browser and deployed UX need manual checks.

See [optional multi-business registration, lifecycle and scoped permissions](multi-business.md) for the expanded business workflow and compatibility rules.
