import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { runInNewContext } from "node:vm";
import {
  connectTheme,
  resolvedTheme,
  themeBootstrap,
  themePreference,
  themeStorageKey,
} from "../app/lib/theme.ts";

const original = Object.fromEntries(
  ["window", "document", "localStorage"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
let media, events, storage, root, controller;
beforeEach(() => {
  media = new EventTarget();
  media.matches = true;
  events = new EventTarget();
  events.matchMedia = () => media;
  storage = { getItem: jest.fn(() => null), setItem: jest.fn() };
  root = { dataset: {} };
  for (const [key, value] of Object.entries({
    window: events,
    document: { documentElement: root },
    localStorage: storage,
  }))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  for (const [key, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
test("system preference follows the device and saved light overrides a dark device", () => {
  expect(resolvedTheme("system", true)).toBe("dark");
  expect(resolvedTheme("system", false)).toBe("light");
  expect(resolvedTheme("light", true)).toBe("light");
  expect(themePreference("unexpected")).toBe("system");
});
test.each([
  ["light", true, "light"],
  ["dark", false, "dark"],
  [null, true, "dark"],
  ["invalid", false, "light"],
])(
  "pre-paint script resolves saved %s and system dark=%s",
  (saved, systemDark, expected) => {
    runInNewContext(themeBootstrap, {
      localStorage: { getItem: () => saved },
      matchMedia: () => ({ matches: systemDark }),
      document: { documentElement: root },
    });
    expect(root.dataset.theme).toBe(expected);
  },
);
test("pre-paint script tolerates blocked storage", () => {
  runInNewContext(themeBootstrap, {
    get localStorage() {
      throw new Error("Blocked");
    },
    matchMedia: () => ({ matches: true }),
    document: { documentElement: root },
  });
  expect(root.dataset.theme).toBe("dark");
});
test("theme changes persist, survive route component changes, and respect system changes only in system mode", () => {
  const changed = jest.fn();
  controller = connectTheme(changed);
  expect(root.dataset.theme).toBe("dark");
  controller.choose("light");
  expect(storage.setItem).toHaveBeenCalledWith(themeStorageKey, "light");
  expect(root.dataset.theme).toBe("light");
  media.dispatchEvent(new Event("change"));
  expect(root.dataset.theme).toBe("light");
  controller.choose("system");
  expect(root.dataset.theme).toBe("dark");
  media.matches = false;
  media.dispatchEvent(new Event("change"));
  expect(root.dataset.theme).toBe("light");
  expect(changed).toHaveBeenLastCalledWith("system");
});
test("other tabs update the theme, unrelated storage changes do not, and listeners are cleaned up", () => {
  const changed = jest.fn();
  controller = connectTheme(changed);
  events.dispatchEvent(
    Object.assign(new Event("storage"), {
      key: themeStorageKey,
      newValue: "light",
    }),
  );
  expect(root.dataset.theme).toBe("light");
  expect(changed).toHaveBeenLastCalledWith("light");
  events.dispatchEvent(
    Object.assign(new Event("storage"), { key: "unrelated", newValue: "dark" }),
  );
  expect(root.dataset.theme).toBe("light");
  controller.dispose();
  events.dispatchEvent(
    Object.assign(new Event("storage"), {
      key: themeStorageKey,
      newValue: "dark",
    }),
  );
  expect(root.dataset.theme).toBe("light");
});
test("blocked storage still permits an in-memory theme choice", () => {
  storage.getItem.mockImplementation(() => {
    throw new Error("Blocked");
  });
  storage.setItem.mockImplementation(() => {
    throw new Error("Blocked");
  });
  controller = connectTheme(() => {});
  expect(() => controller.choose("light")).not.toThrow();
  expect(root.dataset.theme).toBe("light");
});
