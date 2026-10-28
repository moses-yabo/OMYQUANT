import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { connectPwaDisplayMode } from "../app/lib/pwa-display-mode.ts";

const saved = Object.fromEntries(
  ["window", "navigator"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
let media, browser, device, changed, dispose;
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  browser = Object.assign(new EventTarget(), {
    matchMedia: jest.fn(() => media),
  });
  device = { standalone: false };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browser,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: device,
  });
  changed = jest.fn();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test("a browser window stays in website mode even when installation completes", () => {
  dispose = connectPwaDisplayMode(changed);
  expect(changed).toHaveBeenLastCalledWith(false);
  browser.dispatchEvent(new Event("appinstalled"));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(browser.matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
});

test("standalone Android windows use the installed mode", () => {
  media.matches = true;
  dispose = connectPwaDisplayMode(changed);
  expect(changed).toHaveBeenLastCalledWith(true);
});

test("iPhone standalone windows use the iOS fallback", () => {
  device.standalone = true;
  dispose = connectPwaDisplayMode(changed);
  expect(changed).toHaveBeenLastCalledWith(true);
});

test("display changes and restored pages update the mode and cleanup removes listeners", () => {
  dispose = connectPwaDisplayMode(changed);
  media.matches = true;
  media.dispatchEvent(new Event("change"));
  expect(changed).toHaveBeenLastCalledWith(true);
  media.matches = false;
  browser.dispatchEvent(new Event("pageshow"));
  expect(changed).toHaveBeenLastCalledWith(false);
  dispose();
  changed.mockClear();
  media.dispatchEvent(new Event("change"));
  browser.dispatchEvent(new Event("pageshow"));
  expect(changed).not.toHaveBeenCalled();
});
