# Browser bookings and Socket.IO

Run `npm run dev` and open its localhost URL. Without `MONGODB_URI`, development uses the sample catalog and browser `localStorage`. Register and sign in using the [local JWT account backend](local-auth.md); accounts persist in SQLite. `.env` contains `DEMO_MODE=true`; no MongoDB installation is needed. Restart the server after configuration changes.

1. Open a sample taxi, farm product, livestock or trailer listing.
2. Choose seats/quantity or future trailer dates and submit.
3. Review and cancel it in **My activity**.
4. For trailers, simulate approval, rejection, pickup and return from My activity.

Records live under `omyquant.bookings.v1:<userId>` in localStorage. React Router `clientLoader` reads them and `clientAction` creates or changes them after server-side session verification. JWTs stay in HttpOnly cookies. Existing unassigned demo records are not automatically assigned to an account. Clearing browser site storage resets bookings but does not delete the server's SQLite accounts. A different browser, profile, hostname or port has separate booking storage.

Web Locks serialize local inventory checks and writes across tabs. Current browsers on localhost support this API; if locks or storage are unavailable, the app shows a failure rather than reporting an unsaved booking as successful. These are editable development records, not authoritative transactions or verified accounts.

Socket.IO attaches to Vite’s existing HTTP server during development. Its implementation (`scripts/realtime.ts`) and the Node server (`scripts/server.ts`) use TypeScript. `npm run build` compiles them into `build/runtime` through `tsconfig.server.json`; `npm start` runs the compiled server. React Router, static assets and Socket.IO share one port, defaulting to 3000 in production. Docker includes the compiled server.

Connected tabs authenticate with the JWT cookie and join a server-selected room for the verified account. A browser-supplied room cannot change the account identity. The server enforces same-origin browser connections, limits message size, throttles notifications and checks sender/recipient sessions before relaying. Notifications contain no booking records. Socket.IO does not persist or transfer booking data: localStorage remains the sample booking store. Cross-device or shared marketplace inventory is not provided until a shared booking backend is connected.

The footer shows Socket.IO connection state. Local custom events and native storage events also refresh booking screens, so bookings still save and tabs still update when the socket server is temporarily unavailable. Reconnection triggers a fresh local read; stale booking data is not queued for later broadcast.

No payment is taken and no real provider is contacted. MongoDB configuration selects the existing MongoDB API instead. Local-only booking validation does not replace transactions for live inventory. Business signup, delivery quotes and provider administration still require MongoDB; registration/login work locally through SQLite and jose.

`npm test` checks storage snapshots, inventory restoration, trailer conflicts and transitions, plus real Socket.IO connections, room isolation and malformed-room rejection. Browser visual testing is separate.
