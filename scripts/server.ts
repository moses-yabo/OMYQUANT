import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createRequestListener } from "@react-router/node";
import { attachRealtime } from "./realtime.js";
import type { ServerBuild } from "react-router";
const buildPath = "../server/index.js";
const build = (await import(buildPath)) as ServerBuild;

const app = createRequestListener({
  build,
  mode: process.env.NODE_ENV ?? "production",
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
const io = attachRealtime(server);
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
