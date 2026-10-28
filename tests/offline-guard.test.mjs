import { expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function browser({ online = false, snapshot = false } = {}) {
  const listeners = {};
  const workerListeners = {};
  const dialogs = [];
  class Element {
    constructor(kind) {
      this.kind = kind;
    }
    closest(selector) {
      if (selector === "[data-offline-dismiss]")
        return this.kind === "dismiss" ? this : null;
      if (selector === "[data-offline-check]")
        return this.kind === "check" ? this : null;
      if (selector === "[data-offline-reload]")
        return this.kind === "reload" ? this : null;
      if (selector.startsWith(".theme-control"))
        return this.kind === "theme" ? this : null;
      return ["link", "button", "form"].includes(this.kind) ? this : null;
    }
  }
  const root = {
    dataset: {},
    hasAttribute: () => snapshot,
    toggleAttribute: jest.fn(),
  };
  const document = {
    documentElement: root,
    body: { append: (value) => dialogs.push(value) },
    createElement() {
      const dialog = {
        open: false,
        setAttribute: jest.fn(),
        showModal: jest.fn(() => {
          dialog.open = true;
        }),
        close: jest.fn(() => {
          dialog.open = false;
        }),
      };
      return dialog;
    },
  };
  const navigator = {
    onLine: online,
    serviceWorker: {
      controller: {},
      addEventListener: (name, fn) => {
        workerListeners[name] = fn;
      },
    },
  };
  const location = { replace: jest.fn() };
  const fetch = jest
    .fn()
    .mockResolvedValue(Response.json({ data: { service: "OMYQUANT" } }));
  runInNewContext(readFileSync("public/offline-client.js", "utf8"), {
    document,
    navigator,
    location,
    Element,
    fetch,
    AbortSignal,
    window: {
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      matchMedia: () => ({ matches: true }),
    },
    localStorage: { getItem: () => "dark" },
  });
  function click(kind = "link", eventType = "click") {
    const event = {
      target: new Element(kind),
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    listeners[eventType](event);
    return event;
  }
  return {
    click,
    dialogs,
    listeners,
    workerListeners,
    navigator,
    location,
    root,
    fetch,
  };
}

test.each([
  ["link", "click"],
  ["link", "auxclick"],
  ["button", "click"],
  ["form", "submit"],
])(
  "offline %s %s is blocked before navigation/submission and shows one dialog",
  (kind, type) => {
    const state = browser();
    const event = state.click(kind, type);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(state.dialogs[0].innerHTML).toContain("You’re currently offline");
    state.click(kind, type);
    expect(state.dialogs).toHaveLength(1);
    expect(state.dialogs[0].showModal).toHaveBeenCalledTimes(1);
  },
);

test("online links and forms keep their original behavior", () => {
  const state = browser({ online: true });
  expect(state.click("link").preventDefault).not.toHaveBeenCalled();
  expect(state.click("form", "submit").preventDefault).not.toHaveBeenCalled();
  expect(state.dialogs).toHaveLength(0);
});

test("theme controls remain available and the offline dialog can be dismissed", () => {
  const state = browser();
  expect(state.click("theme").preventDefault).not.toHaveBeenCalled();
  state.click();
  state.click("dismiss");
  expect(state.dialogs[0].close).toHaveBeenCalled();
});

test("a static snapshot stays read-only until explicitly reloaded, and inherits the saved theme", () => {
  const state = browser({ online: true, snapshot: true });
  expect(state.root.dataset.theme).toBe("dark");
  expect(state.click().preventDefault).toHaveBeenCalled();
  state.click("reload");
  expect(state.location.replace).toHaveBeenCalledWith("/");
});

test("reload while offline explains the connection issue instead of navigating", () => {
  const state = browser();
  state.click("reload");
  expect(state.location.replace).not.toHaveBeenCalled();
  expect(state.dialogs).toHaveLength(1);
});

test("only the controlling worker can signal a failed connection, and online recovery clears it", () => {
  const state = browser({ online: true });
  state.workerListeners.message({
    source: {},
    data: { type: "OMYQUANT_NETWORK_UNAVAILABLE" },
  });
  expect(state.dialogs).toHaveLength(0);
  state.workerListeners.message({
    source: state.navigator.serviceWorker.controller,
    data: { type: "OMYQUANT_NETWORK_UNAVAILABLE" },
  });
  expect(state.dialogs).toHaveLength(1);
  expect(state.click().preventDefault).toHaveBeenCalled();
  state.listeners.online();
  expect(state.click().preventDefault).not.toHaveBeenCalled();
});

test("Check connection recovers from a network failure without replaying the blocked action", async () => {
  const state = browser({ online: true });
  state.workerListeners.message({
    source: state.navigator.serviceWorker.controller,
    data: { type: "OMYQUANT_NETWORK_UNAVAILABLE" },
  });
  state.click("check");
  await new Promise((resolve) => setImmediate(resolve));
  expect(state.fetch).toHaveBeenCalledWith(
    "/api/v1/health",
    expect.objectContaining({ credentials: "omit", cache: "no-store" }),
  );
  expect(state.dialogs[0].close).toHaveBeenCalled();
  expect(state.click().preventDefault).not.toHaveBeenCalled();
  expect(state.location.replace).not.toHaveBeenCalled();
});
