# Optional Redis catalog cache

OMYQUANT supports Upstash Redis over HTTPS using the platform `fetch` API. No Redis SDK, new server or dependency is required. This is an optional query accelerator, not account storage or an inventory database. With caching disabled, incomplete configuration, a provider error or a quota failure, existing MongoDB reads continue.

## Setup

1. Create an Upstash Redis database in your own account and choose the Free plan. Choose a region near the application/MongoDB where available. Do not enable paid upgrades unless intended.
2. Copy its REST URL and REST token from the database console into your ignored local `.env`, or into the existing hosting service's server environment for production:

   ```dotenv
   REDIS_CACHE_ENABLED=true
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-server-only-rest-token
   REDIS_CACHE_NAMESPACE=omyquant:catalog:v1
   ```

3. Keep credentials out of Git, chat and `VITE_*` variables. Use a database token permitted to GET and SET cache keys. The adapter accepts only root HTTPS endpoints under `.upstash.io`; it does not accept TCP `redis://` URLs or management API credentials.
4. Restart the app. Vite explicitly loads these server variables for development; the existing production start command loads `.env`, and the existing host can inject environment values normally. MongoDB is still required. Browser demo/sample data is not cached in Redis.

No external database/account has been provisioned and no real credentials have been configured by this implementation. The code is disabled by default. To disable it later, set `REDIS_CACHE_ENABLED=false` and restart. Existing cache entries expire automatically; there is no flush/reset operation.

## Cache contents and consistency

Only anonymous collection searches for `farming/products`, `farming/livestock` and `rentals/trailers` are eligible. Redis stores ordered public record IDs and an explicit expiry for 30 seconds. It does not store record contents, documents, search strings, credentials, sessions, customer activity, support cases, orders, bookings, private business lists, taxi schedules or seat counts. Requests with a `business` query parameter bypass Redis. Record/detail routes also bypass it.

Every discovery request first obtains the currently approved providers from MongoDB. That eligibility set participates in the cache key. On a hit, a fresh MongoDB query fetches only the cached IDs while reapplying the provider, published/active, search and province filters. Prices, stock, listing text and image references come from those fresh records. Unpublished, deactivated, deleted or no-longer-eligible records are omitted immediately; a cached page may therefore be temporarily shorter. Domain mutations keep all existing authorization and transaction checks.

Newly created/published records, changes in search membership and changes in sorting/page position become visible after the short selection TTL, at most 30 seconds after that selection was cached. Cached order may temporarily differ from the order implied by a newly edited price/name, even though displayed content is fresh. There is no claim of instant search invalidation or transactionally consistent multi-query snapshots. Redis never decides whether a booking/order/reservation can proceed.

Keys hash the normalized path, pagination, supported search/sort filters, eligible business IDs and MongoDB/origin identity. Separate namespaces are supported. No raw connection URI, query text or account identity is placed in the key. Provider requests carry the token in an Authorization header over HTTPS; redirects are refused.

Each hit costs one GET; a miss normally costs one GET plus one SET with `EX 30`. Missing, malformed or expired entries are misses. Redis requests have a 500 ms timeout. Errors open a per-process 30-second circuit breaker and emit only a generic warning; tokens and provider error bodies are never logged. MongoDB errors remain normal API errors and are never cached. Client response headers remain `Cache-Control: no-store`.

This avoids repeated collection-wide filtering/sorting/pagination work on a hit, but intentionally keeps indexed record fetches and provider eligibility reads live. Measure latency before and after enabling it; Redis adds a network call and does not automatically improve every workload.

## Free tier and verification

Upstash's [published Redis pricing](https://upstash.com/pricing/redis), checked 28 October 2026, lists a Free plan with 256 MB, 10 GB monthly bandwidth and 500,000 monthly commands. Monitor usage in the console; free-tier limits and policies can change. The adapter uses the documented [REST command-array protocol](https://upstash.com/docs/redis/features/restapi).

Run `npm run typecheck` and `npm test`. Tests use intercepted Redis HTTP responses and mocked MongoDB reads. They verify disabled mode, endpoint restrictions, TTL/entry validation, safe errors, circuit fallback, fresh record filtering, key separation and private/taxi bypasses. They do not establish live Redis connectivity, regional latency or real MongoDB concurrency.

After configuring a dedicated test Redis database, verify a first request produces a short-lived ID entry, a repeated query reuses it, edited stock/prices remain current, withdrawn records disappear and new matches appear after expiry. Disable/interrupt Redis and confirm browsing falls back to MongoDB. Inspect only the cache namespace in your own console; never flush a shared database or copy tokens into diagnostics.
