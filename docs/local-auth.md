# Local authentication with jose JWTs

Registration and login now use a real server-side account store when MongoDB is absent. Start `npm run dev`, create an account at `/register`, then sign in at `/login`. No seeded credentials or automatic demo identity are used.

The built-in Node SQLite database stores accounts and revocable sessions in `.local/auth.sqlite`, excluded from Git. Use Node 24 as in the Docker image. This database and its signing key survive app restarts. Back up the `.local` directory if you need to preserve accounts. The optional `LOCAL_AUTH_DIR` environment variable changes its location.

Passwords use scrypt with a unique random salt. Public registration rejects administrator fields and every local account is a customer. Password hashes never leave the server. Login attempts are limited to ten per normalized email per 15-minute fixed window. Registration is limited per email too; public deployment still needs ingress-level abuse limits.

`jose` signs HS256 JWTs containing a subject, unique session ID, issuer, audience, issue time and expiry. Verification pins the algorithm, issuer and audience and requires those claims. JWTs expire after 12 hours. SQLite stores session IDs and expiration times so logout revokes the JWT immediately; token verification also checks account activity and session existence.

JWTs are sent in the `omyquant_jwt` HttpOnly, SameSite=Lax cookie. They are never written to browser localStorage or exposed in a JSON login response. Production cookies use Secure. For a production-mode server used strictly on plain HTTP localhost, explicitly set `AUTH_COOKIE_SECURE=false`; use Secure cookies for deployed HTTPS environments.

A cryptographically random signing key is generated and stored in SQLite on first use. Alternatively set `JWT_SECRET` to at least 32 bytes in the server environment. Do not put it in a `VITE_` variable. Rotating the signing key invalidates existing tokens. Deleting the database removes accounts, sessions and the generated key.

Socket.IO verifies the same JWT before accepting a local connection and uses the verified user ID for its room. A browser-supplied room cannot impersonate another local account. Booking-change messages recheck the session before relaying.

Sample bookings remain in localStorage under `omyquant.bookings.v1:<userId>`. Creating or changing them first verifies the cookie through `/api/v1/users/me`; My activity requires sign-in. Old unassigned demo bookings are not automatically imported into an account. These browser records remain editable development data; authentication does not make localStorage inventory authoritative or synchronize it across devices.

This local account backend supports `/api/v1/auth/register`, `/auth/login`, `/auth/logout` and `/users/me`. Business and production marketplace persistence still require MongoDB. Configuring `MONGODB_URI` selects the existing MongoDB authentication backend, which currently retains its opaque-session implementation; local SQLite accounts are not migrated automatically.

Jest integration tests exercise local registration, duplicate emails, role rejection, password hashing, JWT tampering/expiry/audience rejection, session persistence across restarts, logout revocation, throttling and authenticated Socket.IO connections in an isolated temporary database.
