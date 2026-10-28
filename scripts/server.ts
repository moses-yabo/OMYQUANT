import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequestListener } from "@remix-run/node-fetch-server";
import { createRequestHandler } from "react-router";
import { attachRealtime } from "./realtime.js";
import type { ServerBuild } from "react-router";
const buildPath = "../server/index.js";
const build = (await import(buildPath)) as ServerBuild;

const publicUrl = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL;
const publicOrigin = publicUrl ? new URL(publicUrl) : undefined;
if (publicOrigin && !["http:", "https:"].includes(publicOrigin.protocol))
  throw new Error("APP_ORIGIN must be an HTTP or HTTPS URL");
if (publicOrigin) process.env.APP_ORIGIN = publicOrigin.origin;
else if (!process.env.APP_ORIGIN) delete process.env.APP_ORIGIN;
// Pin the externally visible origin when TLS terminates at Render's proxy.
// Do not trust arbitrary Forwarded headers or disable React Router's CSRF check.
const handleRequest = createRequestHandler(
  build,
  process.env.NODE_ENV ?? "production",
);
const app = createRequestListener((request) => handleRequest(request), {
  host: publicOrigin?.host,
  protocol: publicOrigin?.protocol,
  trustProxy: false,
});
const root = resolve("build/client");
const types: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".html": "text/html; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const path = resolve(
      root,
      "." +
        decodeURIComponent(
          new URL(req.url ?? "/", "http://localhost").pathname,
        ),
    );
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      path.startsWith(root + sep) &&
      (await stat(path).catch(() => null))?.isFile()
    ) {
      res.setHeader(
        "Content-Type",
        types[extname(path)] ?? "application/octet-stream",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (
        [
          "sw.js",
          "manifest.webmanifest",
          "offline.html",
          "offline-client.js",
          "offline.css",
          "apple-touch-icon.png",
          "apple-touch-icon-precomposed.png",
        ].some((file) => path === resolve(root, file))
      )
        res.setHeader("Cache-Control", "no-cache");
      if (path.startsWith(resolve(root, "assets") + sep))
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(req.method === "HEAD" ? undefined : await readFile(path));
    }
    return app(req, res);
  } catch {
    res.statusCode = 400;
    res.end("Invalid request");
  }
});
const io = attachRealtime(server, {
  async authenticateSupport(cookie) {
    const response = await handleRequest(
      new Request(
        new URL(
          "/api/v1/users/me",
          process.env.APP_ORIGIN ?? "http://localhost",
        ),
        { headers: { Cookie: cookie } },
      ),
    );
    if (!response.ok) throw new Error("Authentication required");
    const { data } = (await response.json()) as {
      data?: { _id: string; admin?: boolean; superAdmin?: boolean };
    };
    if (!data?._id) throw new Error("Authentication required");
    return {
      id: String(data._id),
      admin: Boolean(data.admin || data.superAdmin),
    };
  },
});
server.listen(Number(process.env.PORT ?? 3000), () => {
  const address = server.address();
  if (address && typeof address !== "string")
    console.log(`OMYQUANT listening on http://localhost:${address.port}`);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    io.close();
    server.close();
  });
