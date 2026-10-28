import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { connectInstallPrompt, installDismissKey, registerPwaWorker } from "../app/lib/pwa-install.ts";

const descriptors = Object.fromEntries(["window", "navigator", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let browser, device, storage, media, update, controller;
beforeEach(() => {
  jest.useFakeTimers();
  browser = new EventTarget();
  media = new Map();
  browser.isSecureContext = true;
  browser.matchMedia = query => {
    if (!media.has(query)) media.set(query, Object.assign(new EventTarget(), { matches: query === "(pointer: coarse)" }));
    return media.get(query);
  };
  device = { userAgent: "Android", platform: "Linux", maxTouchPoints: 1, serviceWorker: { register: jest.fn().mockResolvedValue({}) } };
  storage = new Map();
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browser },
    navigator: { configurable: true, value: device },
    localStorage: { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
  });
  update = jest.fn();
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  jest.useRealTimers();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
function offer(outcome = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  browser.dispatchEvent(event);
  return event;
}

test("mobile offer waits before showing and only the Install action invokes the browser prompt", async () => {
  controller = connectInstallPrompt(update);
  const event = offer();
  expect(event.defaultPrevented).toBe(true);
  jest.advanceTimersByTime(7999);
  expect(update).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(update).toHaveBeenLastCalledWith("native");
  expect(event.prompt).not.toHaveBeenCalled();
  await controller.install();
  await controller.install();
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenLastCalledWith("hidden");
});

test("Not now suppresses offers across visits until the seven-day cooldown expires", () => {
  controller = connectInstallPrompt(update);
  controller.dismiss();
  expect(Number(storage.get(installDismissKey))).toBe(Date.now() + 7 * 86400000);
  controller.dispose();
  update.mockClear();
  controller = connectInstallPrompt(update);
  offer();
  jest.advanceTimersByTime(8000);
  expect(update).not.toHaveBeenCalled();
  controller.dispose();
  jest.advanceTimersByTime(7 * 86400000);
  controller = connectInstallPrompt(update);
  offer();
  jest.advanceTimersByTime(8000);
  expect(update).toHaveBeenLastCalledWith("native");
});

test.each(["iPhone", "iPad-desktop"])("%s receives manual home-screen instructions without a native event", kind => {
  device.userAgent = kind === "iPhone" ? "iPhone Safari" : "Macintosh Safari";
  device.platform = kind === "iPhone" ? "iPhone" : "MacIntel";
  device.maxTouchPoints = 5;
  controller = connectInstallPrompt(update);
  jest.advanceTimersByTime(8000);
  expect(update).toHaveBeenLastCalledWith("ios");
});

test.each(["standalone", "ios-installed", "insecure", "desktop"])("%s suppresses the custom offer", kind => {
  if (kind === "standalone") browser.matchMedia("(display-mode: standalone)").matches = true;
  if (kind === "ios-installed") device.standalone = true;
  if (kind === "insecure") browser.isSecureContext = false;
  if (kind === "desktop") {
    device.userAgent = "Desktop browser";
    browser.matchMedia("(pointer: coarse)").matches = false;
  }
  controller = connectInstallPrompt(update);
  const event = offer();
  jest.advanceTimersByTime(8000);
  expect(update).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(false);
});

test("installation and cleanup cancel a scheduled offer", () => {
  controller = connectInstallPrompt(update);
  offer();
  browser.dispatchEvent(new Event("appinstalled"));
  update.mockClear();
  jest.advanceTimersByTime(8000);
  expect(update).not.toHaveBeenCalled();
  controller.dispose();
  offer();
  jest.advanceTimersByTime(8000);
  expect(update).not.toHaveBeenCalled();
});

test("unavailable storage does not break installation or dismissal", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Blocked"); } });
  controller = connectInstallPrompt(update);
  const event = offer("dismissed");
  jest.advanceTimersByTime(8000);
  await controller.install();
  expect(event.prompt).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenLastCalledWith("hidden");
  offer();
  update.mockClear();
  jest.advanceTimersByTime(8000);
  expect(update).not.toHaveBeenCalled();
});

test("a failed native prompt offers browser-menu instructions", async () => {
  controller = connectInstallPrompt(update);
  const event = offer();
  event.prompt.mockRejectedValue(new Error("Browser refused"));
  await controller.install();
  expect(update).toHaveBeenLastCalledWith("manual");
});

test("worker registration uses root scope and bypasses stale script caches", async () => {
  await registerPwaWorker();
  expect(device.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  device.serviceWorker.register.mockClear();
  browser.isSecureContext = false;
  await registerPwaWorker();
  expect(device.serviceWorker.register).not.toHaveBeenCalled();
});
