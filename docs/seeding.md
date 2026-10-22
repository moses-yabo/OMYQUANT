# Populate MongoDB with the sample catalog

Use an explicit database when the deployment differs from local settings: `npm run seed:preview -- --database test`, followed by `npm run seed -- --database test` when approved. The preview does not connect; the write command prints its actual target database. Copying sample fixtures does not migrate accounts or orders, switch Render's database, or approve providers. After seeding, review the clearly labelled sample businesses under **Verify businesses** before deciding to expose any of them in the public marketplace. Pending providers remain hidden by the current verification rules.

Run locally with Node.js 24 and installed development dependencies. `npm run seed:preview` shows the planned record counts without connecting. `npm run seed` loads the same MongoDB `.env` settings as Vite and inserts the existing catalog into that database. Keep credentials out of logs/chat and check your configured database before running.

The seed creates seven Product, five Livestock, one Trailer and one Departure record from `app/lib/marketplace.ts`, plus three active/unverified sample businesses, their memberships, a farmer profile, a vehicle and a route. Listings retain their images and integer-ZAR-cent prices. The trailer has illustrative dimensions/payload and the vehicle has a clearly artificial registration. Taxi departure time is initially 09:00 South African time seven days ahead. These are test providers and inventory, not real offers or journeys.

One disabled sample-provider User owns the fixture businesses. It has no password and no administrator rights. No existing user is assigned ownership or modified. Provider management through a real account would require an explicit separate ownership assignment. Browser-local accounts and booking history are not imported.

Stable namespaced ObjectIds plus `$setOnInsert` upserts make reruns insert-only. Existing listing edits, stock reductions, calendar state, bookings and departure times are not reset or deleted. An expired seed departure stays expired on rerun; create a new departure through the existing business API to schedule another test trip. Unique-key conflicts abort rather than overwrite unrelated records.

The write runs in one MongoDB transaction, so Atlas/a replica set is required. Relevant model initialization/index creation finishes first. Do not drop a database or disable unique indexes to seed. The CLI reports inserted counts, not credentials, and has a bounded network timeout; after a timeout, rerunning is safe because IDs are stable. No deployment or application-startup auto-seeding is introduced.

With MongoDB configured, refresh the marketplace after a successful run to load seeded records through the existing live API. Sample data remains explicitly marked in descriptions/provider names, and trailer/route names are marked sample because their listing schemas do not support descriptions.
