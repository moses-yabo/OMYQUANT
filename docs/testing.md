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

The installation audit reports 19 moderate development-dependency findings propagated from a `sprintf-js` denial-of-service advisory through Jest's tooling dependencies. npm reports no available fix for this dependency chain. These findings concern the test toolchain; the Jest packages are development dependencies.

Socket.IO tests import `scripts/realtime.ts` through the TypeScript transformer. Production-server tests launch `build/runtime/server.js`, compiled by `npm run build` using `tsconfig.server.json`.
