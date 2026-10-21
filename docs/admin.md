# Platform administration

Sign in with a MongoDB-backed administrator account and open `/admin/businesses`, or select **Business verification** under Your space. Browser demo identities and business memberships cannot access this area. The server checks the current database role for every request.

An administration bar below the header is visible on desktop and mobile for signed-in administrators. **Verify businesses** opens the review queue; super administrators also see **Manage administrators**. Regular customers and demo accounts do not see this bar.

The queue supports pending, verified and all businesses, name search and pagination. Open a business to review its details, verify it or return it to pending, with an optional note. Each decision and its reviewer are stored in `BusinessReview` in the same MongoDB transaction as the status change. The screen shows the latest 50 decisions. Atlas or another replica set is required. Earlier decisions are not backfilled.

## Grant and revoke access

Super administrators can open **Manage administrators** (`/admin/users`), look up an exact sign-in email, and grant or revoke regular administrator access. Regular administrators can review businesses but cannot look up accounts or change permissions. The existing permissions API now requires a super administrator. Super administrator accounts cannot be modified through the website or that API.

Provision a super administrator from the trusted server terminal with `npm run admin:grant -- --super-admin --email person@example.com`. This updates an existing active account only; there is no automatic promotion when someone registers. The `--super-admin` flag is also required with the revoke command to remove a super administrator from the terminal. Keep at least one trusted super administrator.

The person must first register or sign in so an active account exists in the configured database. From a trusted terminal with that database's environment configuration, run:

```sh
npm run admin:grant -- --email person@example.com --preview
npm run admin:grant -- --email person@example.com
npm run admin:revoke -- --email person@example.com
```

On Windows PowerShell use `npm.cmd`. Multiple emails can be comma-separated or supplied with repeated `--email` options. The command updates existing active accounts only; it never creates accounts. Missing accounts are reported and cause a nonzero exit code even when other matching accounts were updated. Refresh the app after granting access to show the navigation link. Revocation applies on the next server request, including existing sessions.

Keep terminal and database access restricted. Public registration cannot assign administrator or super administrator access. `PATCH /api/v1/users/:id/permissions` requires a super administrator; there is no public bootstrap endpoint or automatic role assignment by email.

## Current scope

Verification unlocks service tools and customer eligibility for an active business. Pending businesses cannot use provider tools; their listings are excluded from public discovery, and new orders, seat bookings and trailer requests require a verified provider. Changing business service types returns it to pending verification. Existing customer records remain in customer history. There is no separate rejected status, automatic document verification or decision notification. Audit records cover administrator verification decisions, not all platform operations or role changes.

Tests cover server role guards, anonymous redirects, API access denial, review validation and transactional audit writes with mocked persistence. Live transaction rollback and browser interactions still require integration verification.
