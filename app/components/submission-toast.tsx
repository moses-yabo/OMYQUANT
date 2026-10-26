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
    <span className="submission-toast-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {error ? <><path d="M12 8v5" /><path d="M12 16h.01" /></> : <path d="m7 12 3 3 7-7" />}
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
    <div className="submission-toast-content"><strong>{title}</strong><p>{message}</p></div>
    <button className="submission-toast-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss notification">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
  </div>;
}
