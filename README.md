# OMYQUANT

OMYQUANT is a South African digital marketplace and transport coordination platform connecting customers with independent providers. OMYQUANT Market covers agricultural goods, livestock and feed; OMYQUANT Transport & Logistics covers taxi seats, parcel delivery requests and trailer rentals. OMYQUANT does not own the fleets or trailers.

This is a full-stack React Router Framework Mode modular monolith. Server resource routes live under `/api/v1`; database and domain modules live in `app/.server`. The existing UI is preserved.

See [backend setup, endpoints and implementation limits](docs/backend.md). Copy `.env.example` and configure MongoDB Atlas (or a local replica set) before exercising database-backed endpoints. The commands below continue to run the React Router frontend and backend together.

For connection failures, run `npm run mongo:check` for read-only, credential-safe diagnostics. See [MongoDB troubleshooting](docs/mongodb-troubleshooting.md).

The [marketplace frontend](docs/frontend.md) includes browsing, saved listings, sign-in, customer requests/activity and business onboarding. Without MongoDB, sample bookings persist in browser **localStorage**, with **Socket.IO** refresh notifications between connected tabs. See [local bookings and realtime setup](docs/local-bookings.md).

Demo registration, login, **jose JWT sessions** and bookings all persist in browser **localStorage**. See [browser authentication](docs/local-auth.md). No SQLite account database is used. Demo JWTs are browser-only; server-verified authentication requires the real backend.

Google sign-in is available as an additional MongoDB-backed method using the existing cookie sessions. It requires a Google Web OAuth client and server configuration; it does not operate in browser demo mode or automatically link accounts by email. See [Google setup, exact callback URLs and account linking](docs/google-auth.md).

Platform administrators can review businesses at `/admin/businesses`. Use `npm run admin:grant -- --email person@example.com` for an existing active account; see [admin setup, revocation and verification history](docs/admin.md).

Customers and businesses can report delivery, farm goods, livestock, booking or rental problems through **Help and complaints**. Both admin roles handle cases through **Support complaints**, with public replies and private investigation notes. See [support workflow](docs/support.md).

Verified providers can open **My business → Manage business** for farming/livestock listings and orders, trailer listings and rental management, or taxi vehicles/routes/departures and bookings. Tools follow business memberships and service types. See [provider access and verification rules](docs/business-tools.md).

Customers can opt into browser notifications for successful orders, seat bookings and trailer reservation requests while the app is open. Existing in-page confirmations remain available. See [notification setup and current limits](docs/notifications.md); pickup/drop-off and background Web Push remain future work.

The website can also be installed as a home-screen web app. Eligible mobile browsers receive an install offer; iPhone/iPad visitors receive Add to Home Screen instructions. Installation requires HTTPS or localhost. Offline navigation shows a connection page; bookings and account operations still require internet. See [PWA installation and verification](docs/pwa.md).

An optional Upstash Redis free-tier cache accelerates public catalog searches while MongoDB supplies fresh provider eligibility and listing contents. It is disabled until server credentials are configured and falls back to MongoDB on cache failure. See [Redis setup, consistency and limits](docs/redis-cache.md).

To populate the connected MongoDB database with the existing sample catalog, use `npm run seed:preview` then `npm run seed`. The seed is insert-only and preserves existing inventory and accounts. See [sample data seeding](docs/seeding.md).

Product images can be uploaded into Atlas GridFS from the existing business form. Listing photos are served through permission-aware image routes. Run `npm run images:migrate-samples` to move seeded listing images into GridFS; see [image storage](docs/images.md).

## Run the application

Use Node.js 24 (matching the Dockerfile) and npm. Run `npm install`, copy `.env.example` to `.env`, then `npm run dev` and open the printed URL (normally `http://localhost:5173`). On Windows PowerShell, use `npm.cmd` if execution policy blocks npm.ps1.

| Configuration | Behavior |
| --- | --- |
| No `MONGODB_URI`, `DEMO_MODE=true` | Browser-local demo accounts, sample orders, seats and trailer requests; no real provider or payment |
| No URI, `DEMO_MODE=false` | Read-only sample catalog |
| `MONGODB_URI` configured | Existing server authentication and MongoDB workflows; transactions require Atlas/a replica set |

Development without MongoDB defaults to demo unless explicitly disabled. Production requires explicit demo opt-in. `APP_ORIGIN` must match the application's public origin; never commit connection strings or credentials. MongoDB mode takes precedence over demo. Business, delivery and charter persistence requires MongoDB. Browser accounts are not migrated automatically.

Current capabilities include discovery/filtering/saved listings, browser demo accounts and activity, agricultural orders, taxi seats, trailer requests, business onboarding/product creation and delivery/charter request forms. Database workflows are implemented but still need replica-set integration verification. Trailer rentals currently require provider confirmation. Taxi-network parcel discovery and instant trailer confirmation remain planned; generic delivery quotes do not implement route-linked parcel capacity.

| Command | Purpose |
| --- | --- |
| `npm run dev` | React Router/Vite and Socket.IO development server |
| `npm run typecheck` | Generated route types and both TypeScript configurations |
| `npm run build` | Client, SSR bundle and TypeScript Node runtime |
| `npm start` | Serve the production build, API and Socket.IO together (default port 3000) |
| `npm test` | Build, then Jest |
| `npm run test:jest` | Jest against the existing build |
| `npm run test:watch` / `npm run test:coverage` | Watch / coverage; see testing guide |

No lint script is configured. See [existing Render configuration](docs/render.md) before deployment; this documentation audit does not change hosting.

## Project knowledge

- [Product vision](docs/PRODUCT_VISION.md) and [actual architecture](docs/ARCHITECTURE.md).
- [Feature assessment](docs/FEATURE_MATRIX.md), [booking engine](docs/BOOKING_ENGINE.md) and [data model](docs/DATA_MODEL.md).
- [Phased roadmap and approval boundaries](docs/ROADMAP.md), [repository instructions](AGENTS.md).
- [Backend endpoints](docs/backend.md), [frontend flows](docs/frontend.md), [browser auth](docs/local-auth.md), [local bookings/realtime](docs/local-bookings.md) and [Jest verification](docs/testing.md).

Product plans are distinct from implemented or tested behavior. LocalStorage/JWT demo tests are not proof of trusted server authentication, shared inventory or live MongoDB concurrency.

## Starter framework reference

Tests run with **Jest**. Use `npm test`, `npm run test:watch`, or `npm run test:coverage`. See [testing instructions](docs/testing.md) for targeted runs and build requirements.

The original React Router starter reference is retained below for framework setup context; OMYQUANT's current capabilities and limits are described above.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- Plain CSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`, including `build/runtime` for the custom Node/Socket.IO server. Start it with `npm start`; do not substitute a server that omits realtime support.

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

OMYQUANT uses plain CSS. Browser normalization is in `app/styles/reset.css`; marketplace styles are in `app/app.css`, with component-specific styles alongside components. The error page and retained starter welcome component also use plain CSS. Tailwind and its Vite plugin are no longer dependencies.

---

Built with ❤️ using React Router.

See [optional multi-business registration, lifecycle and scoped permissions](docs/multi-business.md) for the expanded business workflow and compatibility rules.
