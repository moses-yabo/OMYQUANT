import { LoadingIndicator } from "./loading";
import { useEffect, useState } from "react";
import "./notification-settings.css";
import {
  disableNotifications,
  enableNotifications,
  notificationState,
  type NotificationState,
} from "../lib/web-notifications";

export function NotificationSettings() {
  const [state, setState] = useState<NotificationState>("unsupported");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => setState(notificationState());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  async function toggle() {
    setPending(true);
    setError("");
    try {
      if (state === "on") {
        disableNotifications();
        setState(notificationState());
      } else setState(await enableNotifications());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Notifications could not be enabled.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="notification-settings">
      <button
        type="button"
        className="text-button"
        onClick={toggle}
        disabled={pending || state === "unsupported" || state === "blocked"}
        aria-describedby="notification-help"
      >
        {pending
          ? "Enabling notifications…"
          : state === "on"
            ? "Turn off browser notifications"
            : "Enable browser notifications"}
      </button>
      {pending && (
        <LoadingIndicator label="Updating notification preference..." compact />
      )}
      <p id="notification-help" className="muted" role="status">
        {error ||
          (state === "on"
            ? "Order, booking and rental request alerts are on while the app is open."
            : state === "blocked"
              ? "Notifications are blocked. You can allow them in your browser’s site settings."
              : state === "unsupported"
                ? "Browser notifications are unavailable here. In-app confirmations still work."
                : "Optional alerts for successful orders, bookings and rental requests.")}
      </p>
    </div>
  );
}
