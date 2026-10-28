import { test } from "@jest/globals";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { io as client } from "socket.io-client";
import { attachRealtime } from "../scripts/realtime.ts";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { once } from "node:events";

import {
  addBooking,
  available,
  changeBooking,
  readBookings,
} from "../app/lib/local-booking-store.ts";
const catalog = [
  {
    id: "taxi",
    kind: "taxis",
    name: "Sample departure",
    quantity: 6,
    price: 45000,
  },
  {
    id: "trailer",
    kind: "trailers",
    name: "Sample trailer",
    quantity: 1,
    price: 35000,
  },
];
test("localStorage snapshots preserve bookings and cancellation restores seats", () => {
  let raw = null;
  let result = addBooking(
    readBookings(raw),
    catalog,
    { id: "taxi", kind: "taxis", quantity: 4 },
    "first",
  );
  raw = JSON.stringify(result.bookings);
  assert.equal(readBookings(raw)[0].total, 180000);
  assert.equal(available(catalog[0], readBookings(raw)), 2);
  assert.throws(
    () =>
      addBooking(
        readBookings(raw),
        catalog,
        { id: "taxi", kind: "taxis", quantity: 3 },
        "overbook",
      ),
    /between 1 and 2/,
  );
  raw = JSON.stringify(changeBooking(readBookings(raw), "first", "cancelled"));
  assert.equal(available(catalog[0], readBookings(raw)), 6);
  assert.throws(
    () => changeBooking(readBookings(raw), "first", "cancelled"),
    /status change/,
  );
  assert.throws(() => readBookings("{invalid"), SyntaxError);
  assert.throws(() => readBookings("{}"), /invalid/);
});
test("trailer confirmation blocks overlaps, permits adjacent intervals and completes return", () => {
  const now = Date.now();
  const day = (n) => new Date(now + n * 86400000).toISOString();
  let bookings = addBooking(
    [],
    catalog,
    {
      id: "trailer",
      kind: "trailers",
      quantity: 1,
      start: day(2),
      end: day(4),
    },
    "one",
    now,
  ).bookings;
  bookings = addBooking(
    bookings,
    catalog,
    {
      id: "trailer",
      kind: "trailers",
      quantity: 1,
      start: day(3),
      end: day(5),
    },
    "two",
    now,
  ).bookings;
  bookings = changeBooking(bookings, "one", "confirmed");
  assert.throws(() => changeBooking(bookings, "two", "confirmed"), /overlaps/);
  bookings = addBooking(
    bookings,
    catalog,
    {
      id: "trailer",
      kind: "trailers",
      quantity: 1,
      start: day(4),
      end: day(6),
    },
    "adjacent",
    now,
  ).bookings;
  bookings = changeBooking(bookings, "adjacent", "confirmed");
  bookings = changeBooking(bookings, "one", "picked_up");
  bookings = changeBooking(bookings, "one", "returned");
  assert.equal(bookings[0].status, "returned");
  assert.equal(bookings[0].total, 70000);
  assert.throws(
    () =>
      addBooking(
        bookings,
        catalog,
        {
          id: "trailer",
          kind: "trailers",
          quantity: 1,
          start: day(-1),
          end: day(1),
        },
        "past",
        now,
      ),
    /future/,
  );
});
const wait = (socket, event) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out: ${event}`)),
      4000,
    );
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
test("Socket.IO relays refreshes only within the same browser room", async () => {
  const previousMongo = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://unused-in-room-test";
  const server = createServer();
  const realtime = attachRealtime(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  try {
    for (const room of ["a".repeat(64), "a".repeat(64), "b".repeat(64)]) {
      const socket = client(url, {
        auth: { room },
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      await wait(socket, "connect");
    }
    let leaked = false;
    clients[2].on("bookings:refresh", () => {
      leaked = true;
    });
    const refreshed = wait(clients[1], "bookings:refresh");
    clients[0].emit("bookings:changed");
    await refreshed;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(leaked, false);
    const invalid = client(url, {
      auth: { room: "invalid" },
      forceNew: true,
      reconnection: false,
    });
    clients.push(invalid);
    const [error] = await wait(invalid, "connect_error");
    assert.match(error.message, /Invalid local booking room/);
  } finally {
    if (previousMongo === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousMongo;
    clients.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => realtime.close(resolve));
  }
});
test("production server serves React Router, static assets and Socket.IO together", async () => {
  const root = resolve(".local");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(resolve(root, "server-test-"));
  const child = spawn(process.execPath, ["build/runtime/server.js"], {
    env: {
      ...process.env,
      PORT: "0",
      DEMO_MODE: "true",
      MONGODB_URI: "",
      LOCAL_AUTH_DIR: directory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let socket;
  let startupOutput = "";
  child.stderr.on("data", (data) => {
    startupOutput += data.toString();
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(`Production server did not start. ${startupOutput}`),
          ),
        15000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Production server exited ${code}`));
      });
      child.stdout.on("data", (data) => {
        startupOutput += data.toString();
        const match = startupOutput.match(/http:\/\/localhost:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
    const health = await fetch(url + "/api/v1/health");
    assert.equal(health.status, 200);
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Loading your marketplace/);
    const asset = await fetch(url + "/images/trailer.svg");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("Content-Type"), /image\/svg/);
    socket = client(url, {
      auth: { room: "d".repeat(64) },
      reconnection: false,
    });
    await wait(socket, "connect");
  } finally {
    socket?.disconnect();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    assert.ok(directory.startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
