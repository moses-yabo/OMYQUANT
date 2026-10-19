# Browser bookings and Socket.IO

Run `npm run dev`, register a [browser account](local-auth.md), then sign in. Accounts, sessions and sample bookings all persist in localStorage. No SQLite database or account server persistence is used.

Open a sample listing to reserve seats, order agricultural goods or request a trailer. Review/cancel bookings in My activity. Trailer controls simulate approval, rejection, pickup and return. Web Locks serialize booking changes across tabs sharing the same browser origin and account.

Socket.IO attaches to Vite's existing server during development. In production, `npm run build` compiles the TypeScript server and `npm start` serves React Router, assets and Socket.IO together. The footer shows connection status.

Socket rooms use an opaque random browser key for refresh notifications only. They are not authenticated identities. Notifications contain no account or booking records, and the server does not persist them. Local storage events also refresh views when sockets are unavailable. Browser demo data is not synchronized across devices or authoritative shared inventory.

Clearing browser storage resets accounts, sessions and bookings. Other origins and browsers have independent data. No payment is taken and no real provider is contacted. Connecting MongoDB selects the existing real backend; demo accounts are not automatically migrated.
