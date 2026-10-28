import { expect, jest, test } from "@jest/globals";
import { bookingNotification } from "../app/lib/notification-content.ts";
import {
  notificationState,
  notifyBookingCreated,
} from "../app/lib/web-notifications.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test.each(["products", "livestock"])(
  "%s creation produces an order notification",
  (kind) => {
    expect(bookingNotification(kind, "reference-123")).toMatchObject({
      title: "Order placed",
      url: "/account#orders",
      tag: "omyquant-created-reference-123",
    });
  },
);
test("seat confirmation and trailer requests use accurate separate statuses", () => {
  expect(bookingNotification("taxis", "trip")).toMatchObject({
    title: "Seats reserved",
    url: "/account#bookings",
  });
  const rental = bookingNotification("trailers", "rental");
  expect(rental.title).toBe("Trailer reservation requested");
  expect(rental.body).toMatch(/confirmation is still required/);
  expect(rental.url).toBe("/account#reservations");
});
test("demo notifications never imply a real provider secured inventory", () => {
  const demo = bookingNotification("taxis", "demo", true);
  expect(demo.title).toMatch(/^Demo/);
  expect(demo.body).toMatch(/No real provider/);
  expect(demo.body).not.toMatch(/booking is confirmed/);
});
test("unknown kinds and missing references produce no notification", () => {
  expect(bookingNotification("invalid", "reference")).toBeNull();
  expect(bookingNotification("taxis", "")).toBeNull();
});
test("notifications are safe during SSR and unavailable browsers never reject a booking", async () => {
  expect(notificationState()).toBe("unsupported");
  await expect(
    notifyBookingCreated("products", "reference"),
  ).resolves.toBeUndefined();
});

test("default, denied and disabled permissions never prompt during checkout", async () => {
  const descriptors = Object.fromEntries(
    ["window", "navigator", "Notification", "localStorage"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const requestPermission = jest.fn();
  const api = { permission: "default", requestPermission };
  let enabled = "true";
  try {
    Object.defineProperties(globalThis, {
      window: {
        configurable: true,
        value: { isSecureContext: true, Notification: api },
      },
      Notification: { configurable: true, value: api },
      navigator: {
        configurable: true,
        value: { serviceWorker: { register: jest.fn() } },
      },
      localStorage: { configurable: true, value: { getItem: () => enabled } },
    });
    expect(notificationState()).toBe("off");
    await notifyBookingCreated("products", "default");
    api.permission = "denied";
    expect(notificationState()).toBe("blocked");
    await notifyBookingCreated("taxis", "denied");
    api.permission = "granted";
    enabled = "false";
    expect(notificationState()).toBe("off");
    await notifyBookingCreated("trailers", "disabled");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("production client retains the notification worker referenced by its URL module", () => {
  const directory = "build/client/assets";
  const modules = readdirSync(directory).filter((name) =>
    /^notification-worker-.*\.js$/.test(name),
  );
  const references = modules.flatMap((name) =>
    [
      ...readFileSync(join(directory, name), "utf8").matchAll(
        /\/assets\/(notification-worker-[\w-]+\.js)/g,
      ),
    ].map((match) => match[1]),
  );
  expect(references.length).toBeGreaterThan(0);
  for (const reference of references) {
    expect(existsSync(join(directory, reference))).toBe(true);
    expect(readFileSync(join(directory, reference), "utf8")).toContain(
      "notificationclick",
    );
  }
});
