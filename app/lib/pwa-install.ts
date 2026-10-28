export type InstallMode = "hidden" | "native" | "ios" | "manual";
type InstallEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export const installDismissKey = "omyquant.install.dismissed-until.v1";
const cooldown = 7 * 24 * 60 * 60 * 1000;

export function installedApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// The browser owns installation. Only the explicit Install button calls prompt().
export function connectInstallPrompt(update: (mode: InstallMode) => void) {
  let deferred: InstallEvent | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dismissed = false;
  let disposed = false;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mobile = ios || /Android/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  const supported = window.isSecureContext && mobile;
  const suppressed = () => {
    if (!supported || disposed || dismissed || installedApp()) return true;
    try { return Number(localStorage.getItem(installDismissKey)) > Date.now(); }
    catch { return false; }
  };
  const hide = () => {
    clearTimeout(timer);
    update("hidden");
  };
  const dismiss = () => {
    dismissed = true;
    try { localStorage.setItem(installDismissKey, String(Date.now() + cooldown)); }
    catch { /* Keep this visit usable when browser storage is unavailable. */ }
    hide();
  };
  const schedule = (mode: InstallMode) => {
    clearTimeout(timer);
    if (!suppressed()) timer = setTimeout(() => {
      if (!suppressed()) update(mode);
    }, 8000);
  };
  const beforeInstall = (event: Event) => {
    if (!supported || installedApp()) return;
    event.preventDefault();
    deferred = event as InstallEvent;
    schedule("native");
  };
  const installed = () => {
    deferred = undefined;
    dismissed = true;
    hide();
  };
  const display = window.matchMedia("(display-mode: standalone)");
  const displayChanged = () => { if (installedApp()) installed(); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === installDismissKey && suppressed()) hide();
  };
  window.addEventListener("beforeinstallprompt", beforeInstall);
  window.addEventListener("appinstalled", installed);
  window.addEventListener("storage", storageChanged);
  display.addEventListener("change", displayChanged);
  if (ios) schedule("ios");
  return {
    dismiss,
    async install() {
      const event = deferred;
      if (!event || suppressed()) return;
      deferred = undefined;
      hide();
      try {
        await event.prompt();
        await event.userChoice;
        if (!disposed) dismiss();
      } catch {
        if (!suppressed()) update("manual");
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("storage", storageChanged);
      display.removeEventListener("change", displayChanged);
    },
  };
}

export async function registerPwaWorker() {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}
