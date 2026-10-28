import { useEffect, useRef, useState } from "react";
import {
  connectInstallPrompt,
  registerPwaWorker,
  type InstallMode,
} from "../lib/pwa-install";
import "./pwa-install.css";

export function PwaInstall() {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const controller = useRef<ReturnType<typeof connectInstallPrompt> | null>(
    null,
  );
  useEffect(() => {
    const current = connectInstallPrompt(setMode);
    controller.current = current;
    void registerPwaWorker().catch(() => {
      /* Installation must not interrupt the site. */
    });
    return () => {
      controller.current = null;
      current.dispose();
    };
  }, []);
  if (mode === "hidden") return null;
  return (
    <aside className="pwa-install" aria-labelledby="pwa-install-title">
      <div className="pwa-install-header">
        <img src="/images/pwa-192.png" width="44" height="44" alt="" />
        <div>
          <span className="pwa-install-eyebrow">Always within reach</span>
          <h2 id="pwa-install-title">Add OMYQUANT</h2>
        </div>
        <button
          className="pwa-install-close"
          type="button"
          aria-label="Dismiss install suggestion"
          onClick={() => controller.current?.dismiss()}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <p className="pwa-install-description">
        Keep the marketplace a tap away. Add OMYQUANT to your home screen.
      </p>
      {mode === "ios" && (
        <>
          <ol className="pwa-install-steps">
            <li>
              <span>
                Open your browser’s <strong>Share</strong> menu.
              </span>
            </li>
            <li>
              <span>
                Choose <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li>
              <span>
                Tap <strong>Add</strong> to finish.
              </span>
            </li>
          </ol>
          <p className="pwa-install-hint">
            If shown, keep <strong>Open as Web App</strong> turned on.
          </p>
        </>
      )}
      {mode === "manual" && (
        <ol className="pwa-install-steps">
          <li>
            <span>Open your browser’s menu.</span>
          </li>
          <li>
            <span>
              Choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>, if available.
            </span>
          </li>
        </ol>
      )}
      <div className="pwa-install-actions">
        {mode === "native" && (
          <button
            className="pwa-install-primary"
            type="button"
            onClick={() => void controller.current?.install()}
          >
            Install app
          </button>
        )}
        <button type="button" onClick={() => controller.current?.dismiss()}>
          {mode === "native" ? "Not now" : "Got it"}
        </button>
      </div>
    </aside>
  );
}
