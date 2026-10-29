import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequestHandler } from "react-router";
import * as build from "../build/server/index.js";

const sizes = JSON.parse(readFileSync("app/lib/apple-startup-sizes.json", "utf8"));
const saved = { uri: process.env.MONGODB_URI, demo: process.env.DEMO_MODE };
beforeEach(() => { delete process.env.MONGODB_URI; process.env.DEMO_MODE = "false"; });
afterEach(() => {
  for (const [key, value] of [["MONGODB_URI", saved.uri], ["DEMO_MODE", saved.demo]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function checkPng(bytes, width, height) {
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(width);
  expect(bytes.readUInt32BE(20)).toBe(height);
  expect(bytes[25]).toBe(2); // RGB, without an alpha channel.
}

test("Apple icon has an opaque PNG at both conventional root fallback paths", () => {
  for (const path of ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"]) {
    checkPng(readFileSync(`build/client/${path}`), 180, 180);
  }
  expect(build.routes.root.module.links()).toEqual(expect.arrayContaining([
    expect.objectContaining({ rel: "apple-touch-icon", type: "image/png", sizes: "180x180", href: "/apple-touch-icon.png?v=3" }),
  ]));
});

test.each(sizes)("Apple launch assets match $width x $height CSS pixels at $scale x in both orientations", ({ width, height, scale }) => {
  const links = build.routes.root.module.links().filter(link => link.rel === "apple-touch-startup-image");
  for (const orientation of ["portrait", "landscape"]) {
    const w = (orientation === "portrait" ? width : height) * scale;
    const h = (orientation === "portrait" ? height : width) * scale;
    const href = `/images/apple-startup-v1/${w}x${h}.png`;
    const link = links.find(link => link.href === href);
    expect(link).toMatchObject({ type: "image/png" });
    expect(link.media).toContain(`(device-width: ${width}px)`);
    expect(link.media).toContain(`(device-height: ${height}px)`);
    expect(link.media).toContain(`(-webkit-device-pixel-ratio: ${scale})`);
    expect(link.media).toContain(`(orientation: ${orientation})`);
    checkPng(readFileSync(`build/client${href}`), w, h);
  }
});

test("initial server-rendered HTML exposes icon and launch links before JavaScript hydration", async () => {
  const response = await createRequestHandler(build, "production")(new Request("http://localhost/login"));
  expect(response.status).toBe(200);
  const head = (await response.text()).match(/<head>[\s\S]*?<\/head>/)?.[0];
  expect(head).toContain('rel="apple-touch-icon"');
  expect(head).toContain('rel="manifest" href="/manifest.webmanifest"');
  expect(head).toContain('href="/apple-touch-icon.png?v=3"');
  expect(head.match(/rel="apple-touch-startup-image"/g)).toHaveLength(sizes.length * 2);
  expect(head).toContain('name="apple-mobile-web-app-capable" content="yes"');
});

test("production HTTP serves the manifest, worker, Android icons and Apple assets without authentication", async () => {
  const child = spawn(process.execPath, ["build/runtime/server.js"], {
    env: { ...process.env, PORT: "0", NODE_ENV: "production", MONGODB_URI: "", DEMO_MODE: "false", APP_ORIGIN: "http://127.0.0.1" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Production server startup timed out")), 15000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Production server exited: ${code}`)); });
      child.stdout.on("data", bytes => {
        const match = String(bytes).match(/listening on http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.redirected).toBe(false);
    expect(manifestResponse.headers.get("Content-Type")).toBe("application/manifest+json");
    expect(manifestResponse.headers.get("Cache-Control")).toBe("no-cache");
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ id: "/", name: "OMYQUANT", short_name: "OMYQUANT", start_url: "/", scope: "/", display: "standalone" });
    const launch = new URL(manifest.start_url, origin);
    expect(launch.origin).toBe(origin);
    expect(launch.pathname.startsWith(manifest.scope)).toBe(true);
    expect((await fetch(launch)).status).toBe(200);
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
      expect(icon).toMatchObject({ type: "image/png", purpose: "any" });
      const response = await fetch(new URL(icon.src, origin));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
    }
    for (const [path, type] of [["/manifest.webmanifest", "application/manifest+json"], ["/sw.js", "text/javascript"]]) {
      const response = await fetch(`${origin}${path}`, { method: "HEAD" });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(type);
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(await response.text()).toBe("");
    }
    const worker = await fetch(`${origin}/sw.js`);
    expect(worker.status).toBe(200);
    expect(worker.headers.get("Content-Type")).toBe("text/javascript");
    expect(await worker.text()).toContain('self.addEventListener');
    for (const [path, width, height] of [
      ["/apple-touch-icon.png?v=3", 180, 180],
      ["/apple-touch-icon-precomposed.png", 180, 180],
      ["/images/apple-startup-v1/1170x2532.png", 1170, 2532],
      ["/images/apple-startup-v1/2532x1170.png", 2532, 1170],
    ]) {
      const url = `http://127.0.0.1:${port}${path}`;
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      checkPng(Buffer.from(await response.arrayBuffer()), width, height);
      const head = await fetch(url, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    }
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
});
