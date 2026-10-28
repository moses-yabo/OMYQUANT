import { useEffect, useRef, useState } from "react";
import { connectInstallPrompt, registerPwaWorker, type InstallMode } from "../lib/pwa-install";
import "./pwa-install.css";

export function PwaInstall() {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const controller = useRef<ReturnType<typeof connectInstallPrompt> | null>(null);
  useEffect(() => {
    const current = connectInstallPrompt(setMode);
    controller.current = current;
    void registerPwaWorker().catch(() => { /* Installation must not interrupt the site. */ });
    return () => { controller.current = null; current.dispose(); };
  }, []);
  if (mode === "hidden") return null;
  return <aside className="pwa-install" aria-labelledby="pwa-install-title">
    <img src="/images/pwa-192.png" width="44" height="44" alt="" />
    <div className="pwa-install-content">
      <h2 id="pwa-install-title">Install OMYQUANT</h2>
      <p>{mode === "ios"
        ? <>Open <strong>Share</strong> in your browser and choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>. If offered, keep <strong>Open as Web App</strong> enabled.</>
        : mode === "manual"
          ? <>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, if available.</>
          : "Add to your home screen for quick access to OMYQUANT."}</p>
      <div className="pwa-install-actions">
        {mode === "native" && <button className="pwa-install-primary" type="button" onClick={() => void controller.current?.install()}>Install app</button>}
        <button type="button" onClick={() => controller.current?.dismiss()}>{mode === "native" ? "Not now" : "Got it"}</button>
      </div>
    </div>
  </aside>;
}
