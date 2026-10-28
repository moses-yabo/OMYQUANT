import { bookingNotification } from "./notification-content";

const preferenceKey = "omyquant.notifications.enabled.v1";
export type NotificationState = "unsupported" | "blocked" | "off" | "on";
export function notificationState(): NotificationState {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  )
    return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    return Notification.permission === "granted" &&
      localStorage.getItem(preferenceKey) === "true"
      ? "on"
      : "off";
  } catch {
    return "unsupported";
  }
}

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
async function registration() {
  registrationPromise ??= (async () => {
    const { default: url } = await import("../.client/notification-worker");
    const registered = await navigator.serviceWorker.register(url, {
      type: "module",
    });
    if (registered.active?.state === "activated") return registered;
    const worker =
      registered.installing ?? registered.waiting ?? registered.active;
    if (!worker) throw new Error("Notification worker is unavailable.");
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
      };
      const changed = () => {
        if (worker.state === "activated") {
          cleanup();
          resolve();
        } else if (worker.state === "redundant") {
          cleanup();
          reject(new Error("Notification worker could not start."));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Notification worker timed out."));
      }, 8000);
      worker.addEventListener("statechange", changed);
      changed();
    });
    return registered;
  })().catch((error) => {
    registrationPromise = undefined;
    throw error;
  });
  return registrationPromise;
}

// Call only from the explicit Enable button, never from a loader or checkout.
export async function enableNotifications() {
  if (notificationState() === "unsupported")
    throw new Error(
      "Browser notifications require HTTPS or localhost and a supported browser.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return notificationState();
  await registration();
  localStorage.setItem(preferenceKey, "true");
  return notificationState();
}
export function disableNotifications() {
  localStorage.removeItem(preferenceKey);
}

export async function notifyBookingCreated(
  kind: string,
  reference: string,
  demo = false,
) {
  // Notification errors must never turn a committed booking into a checkout error.
  try {
    const content = bookingNotification(kind, reference, demo);
    if (!content || notificationState() !== "on") return;
    const worker = await registration();
    const dedupe = `omyquant.notification-shown:${reference}`;
    if (sessionStorage.getItem(dedupe)) return;
    await worker.showNotification(content.title, {
      body: content.body,
      tag: content.tag,
      icon: "/images/favicon.png",
      data: { url: content.url },
    });
    sessionStorage.setItem(dedupe, "true");
  } catch {
    /* Existing in-page success feedback remains authoritative. */
  }
}
