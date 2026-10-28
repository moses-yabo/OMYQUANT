import { afterEach, beforeEach, expect, test } from "@jest/globals";
import { createRequestHandler } from "react-router";
import * as build from "../build/server/index.js";
import { customerMobileTabs } from "../app/lib/mobile-navigation.ts";
import { renderBusinessTools } from "./helpers/business-tools-render.mjs";

const saved = { uri: process.env.MONGODB_URI, demo: process.env.DEMO_MODE };
beforeEach(() => {
  delete process.env.MONGODB_URI;
  process.env.DEMO_MODE = "false";
});
afterEach(() => {
  for (const [key, value] of [
    ["MONGODB_URI", saved.uri],
    ["DEMO_MODE", saved.demo],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test.each([
  ["/", "", "", "Marketplace"],
  ["/", "?section=taxis", "#listings", "Marketplace"],
  ["/", "?saved=1", "#listings", "Saved"],
  ["/account", "", "#orders", "Activity"],
  ["/account", "", "#bookings", "Activity"],
  ["/account", "", "#reservations", "Activity"],
  ["/account", "", "", "Account"],
  ["/login", "", "", "Account"],
  ["/register", "", "", "Account"],
])(
  "%s %s %s has one active mobile destination",
  (pathname, search, hash, label) => {
    expect(
      customerMobileTabs(pathname, search, hash, true)
        .filter((tab) => tab.active)
        .map((tab) => tab.label),
    ).toEqual([label]);
  },
);

test("guest Account retains login and signed-in Account retains the existing account route", () => {
  expect(
    customerMobileTabs("/", "", "", false).find(
      (tab) => tab.label === "Account",
    ).to,
  ).toBe("/login");
  expect(
    customerMobileTabs("/", "", "", true).find((tab) => tab.label === "Account")
      .to,
  ).toBe("/account");
  expect(
    customerMobileTabs("/", "", "", false).find(
      (tab) => tab.label === "Activity",
    ).to,
  ).toBe("/account#orders");
});

test("browser SSR retains normal navigation until a standalone PWA window is detected", async () => {
  const handle = createRequestHandler(build, "production");
  const response = await handle(new Request("http://localhost/login"));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).not.toContain('aria-label="Mobile navigation"');
  expect(html).not.toContain("customer-mobile-shell");
  expect(html).toContain('aria-label="Marketplace"');
});

test("provider workspaces retain their service navigation without customer mobile tabs", () => {
  const html = renderBusinessTools("vehicles");
  expect(html).toContain('aria-label="Business management"');
  expect(html).not.toContain('aria-label="Mobile navigation"');
  expect(html).not.toContain("customer-mobile-shell");
});
