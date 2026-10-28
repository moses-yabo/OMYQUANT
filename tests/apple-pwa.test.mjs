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
  expect(head).toContain('href="/apple-touch-icon.png?v=3"');
  expect(head.match(/rel="apple-touch-startup-image"/g)).toHaveLength(sizes.length * 2);
  expect(head).toContain('name="apple-mobile-web-app-capable" content="yes"');
});

test("production HTTP serves Apple fallback icons and launch PNGs without authentication", async () => {
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
