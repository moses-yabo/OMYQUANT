# Browser-only accounts

Without MongoDB, account registration, login and logout run through React Router client actions. They persist in browser localStorage, not SQLite or server files.

- `omyquant.accounts.v1`: names, normalized emails, account IDs, random salts and PBKDF2-SHA256 password hashes (100,000 iterations). Plaintext passwords are not saved.
- `omyquant.session.v1`: the signed JWT string, with a 12-hour expiry.
- `omyquant.demo-jwt-key.v1`: the browser demo's random HS256 signing key.
- `omyquant.bookings.v1:<userId>`: sample bookings for that browser account.

Register at `/register`, sign in at `/login`, then view bookings at `/account`. Reloading or restarting the server retains the browser data. Logging out removes the session, retaining accounts and bookings. Clearing site storage removes all browser accounts and bookings. A different browser, profile, hostname or port has separate data.

`jose` signs the demo JWT after the browser password check, stores it in localStorage, and verifies its signature, fixed HS256 algorithm, issuer, audience, required claims and expiry when restoring the user. Logout deletes the JWT. Invalid, expired and old-format sessions are removed and require a fresh sign-in.

This is demo authentication, not server-verified access control. The signing key is also browser-owned, so a browser user can create replacement tokens. Password hashing and JWT signatures do not make client-only identity authoritative. These demo JWTs are never sent to protected backend APIs or accepted by the server. Real server authentication requires a server-held key and account persistence such as MongoDB.

The previous SQLite implementation has been removed. Existing `.local/auth.sqlite` files are no longer opened or modified and are not imported into browser storage. Register a browser account to start using the requested storage mode.

Enable this mode with `DEMO_MODE=true` and leave `MONGODB_URI` unset. It is enabled by default in development without MongoDB. A deployed build requires JavaScript and HTTPS for browser crypto and storage APIs.

Jest tests exercise registration, normalized duplicate detection, password hashing, login, logout, expiration, invalid passwords and independent browser stores. MongoDB still backs non-demo server APIs.
