# MongoDB connection diagnostics

Run `npm run mongo:check` (PowerShell: `npm.cmd run mongo:check`). The script loads local development environment settings, applies the application's URI/credential handling, and attempts a read-only ping with automatic collection/index creation disabled. It prints configuration flags, topology and error codes, never URIs, passwords or raw driver messages. A 45-second bound also covers slow DNS discovery. No account or inventory data is changed.

`MongooseServerSelectionError` means the driver could not select an available server. A sanitized nested cause can distinguish DNS, network and TLS problems. It does not by itself prove that a password is wrong. Follow [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

Check the correct Atlas project's database cluster is available and that its Network Access IP list allows the backend host. For local development, that is the development network's public outbound IP; for a hosted backend, it is the host's outbound IP. Check firewall/VPN/TLS inspection if the handshake fails, and outbound Atlas port access. Do not disable TLS verification or switch to browser demo persistence to mask a server connection failure. UI access permissions in Atlas are separate from database network access.

The connection helper coalesces concurrent attempts, clears settled attempts (so a later disconnect can reconnect), and backs off for 10 seconds after failure. It logs one sanitized failure per attempt. Database-unavailable API errors return 503 with Retry-After: 10 rather than duplicating the same error log for each request. This reduces retry/log noise; it does not repair Atlas/network configuration.
