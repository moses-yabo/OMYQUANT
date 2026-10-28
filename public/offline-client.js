(() => {
  const snapshot = document.documentElement.hasAttribute("data-offline-snapshot");
  if (snapshot) {
    let preference = "system";
    try { preference = localStorage.getItem("omyquant:theme") || "system"; } catch {}
    document.documentElement.dataset.theme = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  let failed = false;
  let dialog;
  let checking = false;
  const offline = () => snapshot || failed || navigator.onLine === false;
  function update() {
    document.documentElement.toggleAttribute("data-offline", offline());
  }
  function explain() {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "offline-dialog";
      dialog.setAttribute("aria-labelledby", "offline-dialog-title");
      dialog.innerHTML = '<h2 id="offline-dialog-title">You’re currently offline</h2><p>Reconnect to open this link or continue. Orders, bookings and account changes need an internet connection.</p><p>If a submission was interrupted, check your account after reconnecting before trying again.</p><div class="offline-dialog-actions"><button type="button" data-offline-check>Check connection</button><button type="button" data-offline-dismiss>Got it</button></div>';
      document.body.append(dialog);
    }
    if (!dialog.open) dialog.showModal();
  }
  async function checkConnection() {
    if (checking || navigator.onLine === false) return;
    checking = true;
    try {
      const response = await fetch("/api/v1/health", { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (!response.ok || (await response.json()).data?.service !== "OMYQUANT") return;
      if (snapshot) location.replace("/");
      else { failed = false; update(); dialog?.close(); }
    } catch { /* Keep the connection dialog available; never retry a mutation. */ }
    finally { checking = false; }
  }
  function guard(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    if (target.closest("[data-offline-dismiss]")) { dialog?.close(); return; }
    if (target.closest("[data-offline-check]")) { event.preventDefault(); void checkConnection(); return; }
    if (target.closest("[data-offline-reload]")) {
      event.preventDefault();
      if (navigator.onLine === false) explain();
      else location.replace("/");
      return;
    }
    if (target.closest(".theme-control,.modal-close,.submission-toast-dismiss,.pwa-install-close,.pwa-install-actions button:not(.pwa-install-primary)")) return;
    if (!offline() || !target.closest('a[href],button,input[type="submit"],input[type="image"],form')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    explain();
  }
  // Capture before React Router, native links, target=_blank and form actions.
  window.addEventListener("click", guard, true);
  window.addEventListener("auxclick", guard, true);
  window.addEventListener("submit", guard, true);
  window.addEventListener("offline", update);
  window.addEventListener("online", () => { failed = false; update(); });
  navigator.serviceWorker?.addEventListener("message", event => {
    if (event.source !== navigator.serviceWorker.controller) return;
    if (event.data?.type === "OMYQUANT_NETWORK_UNAVAILABLE") { failed = true; update(); explain(); }
  });
  update();
})();
