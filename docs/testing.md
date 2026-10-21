# Jest tests

Run `npm test` to build React Router and execute the full Jest suite. A build is required because API and production-server tests import `build/server/index.js`.

| Command | Purpose |
| --- | --- |
| `npm test` | Fresh production build, then all Jest tests |
| `npm run test:jest` | Run Jest against the existing build |
| `npm run test:watch` | Watch source/test changes with Jest; rebuild separately after server route changes |
| `npm run test:coverage` | Build, test and generate coverage in `coverage/` |
| `npm run test:jest -- --testNamePattern="trailer"` | Run matching test names |
| `npm run typecheck` | Check TypeScript separately |

`jest.config.mjs` selects the Node environment for booking logic, Socket.IO, HTTP resources and production-server integration tests. ESM uses Node's `--experimental-vm-modules` flag, already included in the scripts. The small TypeScript transformer uses the existing TypeScript compiler; it transpiles imports but does not replace type checking.

`tests/bookings.test.mjs` imports the actual TypeScript booking store directly. Tests cover inventory limits, cancellation, trailer date conflicts and status transitions, Socket.IO room isolation, and the production server. `tests/api.test.mjs` checks React Router resource responses, server rendering and mutation origin restrictions. Tests use ephemeral local ports and do not require MongoDB. Database-dependent preview checks skip when `MONGODB_URI` is supplied.

Node's assertion library is retained inside the migrated tests; Jest now owns discovery, execution, timeouts, watch mode and coverage. Expected cross-origin failures may print React Router rejection messages while the assertions pass. Coverage currently targets booking rules and the realtime server; it is not a claim of full UI coverage.

An earlier installation audit reported 19 moderate development-dependency findings through Jest's tooling dependency chain. This is historical information, not a current security assessment; rerun a dependency audit when reviewing upgrades. Jest packages are development dependencies.

Socket.IO tests import `scripts/realtime.ts` through the TypeScript transformer. Production-server tests launch `build/runtime/server.js`, compiled by `npm run build` using `tsconfig.server.json`.

`tests/inventory.test.mjs` exercises server seat-booking decisions with mocked Mongoose persistence: inactive operators are rejected, unavailable departures create no booking, and successful bookings use the transaction and price snapshot. The inactive-operator regression was reproduced before the fix. These unit tests do not verify real transaction rollback, retries or concurrent database writes; a dedicated replica-set integration suite is still required.

Architecture alignment documentation is indexed in [ARCHITECTURE.md](ARCHITECTURE.md) and [FEATURE_MATRIX.md](FEATURE_MATRIX.md). No lint script is configured. Browser automation, live MongoDB workflows and hosted deployment are not covered by the existing suite.

`tests/google.test.mjs` covers actual OAuth/PKCE and RSA ID-token validation against intercepted provider responses, account resolution/linking decisions, one-use transaction predicates, callback failures and session rotation. `tests/server-auth.test.mjs` regression-checks existing registration, real scrypt password login, Google-only password rejection, protected routes and logout. Database calls in these suites are mocked: they do not prove MongoDB index enforcement or concurrent transaction rollback. Live Google setup and manual test steps are in [google-auth.md](google-auth.md).
