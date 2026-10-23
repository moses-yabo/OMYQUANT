import { useEffect } from "react";
import "./submission-toast.css";

export function SubmissionToast({ title, message, error = false, onDismiss }: {
  title: string; message: string; error?: boolean; onDismiss: () => void;
}) {
  useEffect(() => {
    if (error) return; // Errors stay available while the user corrects the form.
    const timeout = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timeout);
  }, [error, onDismiss]);
  return <div className={`submission-toast${error ? " submission-toast-error" : ""}`} role={error ? "alert" : "status"} aria-atomic="true">
    <div><strong>{title}</strong><p>{message}</p></div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>
  </div>;
}
