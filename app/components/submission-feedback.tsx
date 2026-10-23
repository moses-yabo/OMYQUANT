import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Form as RouterForm, useActionData, useLocation, useNavigation, type FormProps } from "react-router";
import { SubmissionToast } from "./submission-toast";
import { createPortal } from "react-dom";
import { redirectNotice, scrollAfterSubmission, submissionNotice, type SubmissionNotice } from "../lib/submission-feedback";

type Pending = { form: HTMLFormElement; action: string; intent: string; locationKey: string; reset: boolean; scroll: boolean; before: unknown };
const Feedback = createContext<{
  notify: (notice: SubmissionNotice) => void;
  begin: (pending: Omit<Pending, "locationKey">) => boolean;
  finish: (form: HTMLFormElement, notice: SubmissionNotice) => void;
  report: (result: unknown) => void;
  activeForm: HTMLFormElement | null;
}>({ notify: () => {}, begin: () => true, finish: () => {}, report: () => {}, activeForm: null });
const FormPending = createContext(false);

export function SubmissionButton({ children, disabled, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const active = useContext(FormPending) && type !== "button" && type !== "reset";
  return <button {...props} type={type} disabled={disabled || active} aria-busy={active || undefined}>
    {active ? <><span className="submission-spinner" aria-hidden="true" /> Submitting...</> : children}
  </button>;
}

export function SubmissionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<(SubmissionNotice & { id: number }) | null>(null);
  const counter = useRef(0);
  const pending = useRef<Pending | null>(null);
  const [activeForm, setActiveForm] = useState<HTMLFormElement | null>(null);
  const busy = useRef(false);
  const navigation = useNavigation();
  const location = useLocation();
  const notify = useCallback((value: SubmissionNotice) => setNotice({ ...value, id: ++counter.current }), []);
  const dismiss = useCallback(() => setNotice(null), []);
  const finish = useCallback((form: HTMLFormElement, value: SubmissionNotice) => {
    const current = pending.current;
    if (!current || current.form !== form) return;
    pending.current = null;
    setActiveForm(null);
    if (!value.error) {
      if (current.reset && form.isConnected) form.reset();
      if (current.scroll) scrollAfterSubmission();
    }
    notify(value);
  }, [notify]);
  const report = useCallback((result: unknown) => {
    const current = pending.current;
    if (!current || current.before === result) return;
    const value = submissionNotice(result);
    if (value) finish(current.form, value);
  }, [finish]);
  useEffect(() => {
    if (navigation.state !== "idle") { busy.current = true; return; }
    if (!pending.current || (!busy.current && pending.current.locationKey === location.key)) return;
    busy.current = false;
    // Route-level effects get first chance to report their action's result.
    const timer = window.setTimeout(() => {
      const current = pending.current;
      if (!current) return;
      const value = current.locationKey !== location.key ? redirectNotice(current.action, location.pathname + location.search, current.intent) : null;
      if (value) finish(current.form, value);
      else { pending.current = null; setActiveForm(null); } // An unknown outcome must never reset inputs.
    }, 0);
    return () => window.clearTimeout(timer);
  }, [navigation.state, location.key, location.pathname, location.search, finish]);
  const begin = useCallback((value: Omit<Pending, "locationKey">) => {
    if (pending.current) return false;
    pending.current = { ...value, locationKey: location.key };
    setActiveForm(value.form);
    busy.current = false;
    setNotice(null);
    return true;
  }, [location.key]);
  const toast = notice && <SubmissionToast key={notice.id} {...notice} onDismiss={dismiss} />;
  const dialog = notice && typeof document !== "undefined" ? document.querySelector("dialog[open]") : null;
  return <Feedback.Provider value={{ notify, begin, finish, report, activeForm }}>{children}{dialog ? createPortal(toast, dialog) : toast}</Feedback.Provider>;
}

export function useSubmissionFeedback() { return useContext(Feedback).notify; }

export function useFetcherSubmission(state: string, value: unknown, message?: string, outcome: unknown = value) {
  const notify = useSubmissionFeedback();
  const locked = useRef(false);
  const started = useRef(false);
  const before = useRef(value);
  useEffect(() => {
    if (state !== "idle") { locked.current = true; started.current = true; return; }
    if (!locked.current || (value === before.current && !started.current)) return;
    locked.current = false;
    started.current = false;
    if (value !== before.current) {
      const notice = submissionNotice(outcome, message);
      if (notice) notify(notice);
    }
    before.current = value;
  }, [state, value, outcome, message, notify]);
  return () => {
    if (locked.current) return false;
    locked.current = true;
    before.current = value;
    return true;
  };
}

// Shell survives when a successful status change removes its submitted form.
export function useSubmissionOutcome() {
  const result = useActionData();
  const navigation = useNavigation();
  const { report } = useContext(Feedback);
  useEffect(() => { if (navigation.state === "idle") report(result); }, [result, navigation.state, report]);
}

// Keeps React Router's existing action, progressive enhancement and validation.
// GET forms and external Google OAuth redirects keep their original behavior.
export function SubmissionForm({ resetOnSuccess = false, scrollOnSuccess = true, successMessage, onSubmit, children, ...props }: FormProps & {
  resetOnSuccess?: boolean; scrollOnSuccess?: boolean; successMessage?: string;
}) {
  const navigation = useNavigation();
  const result = useActionData();
  const feedback = useContext(Feedback);
  const own = useRef<{ form: HTMLFormElement; before: unknown } | null>(null);
  const mutation = (props.method ?? "get").toLowerCase() !== "get" && !props.reloadDocument;
  useEffect(() => {
    if (!own.current || navigation.state !== "idle") return;
    if (result === own.current.before) return;
    const value = submissionNotice(result, successMessage);
    if (value) { feedback.finish(own.current.form, value); own.current = null; }
  }, [navigation.state, result, feedback, successMessage]);
  const active = mutation && navigation.state !== "idle" && feedback.activeForm !== null && feedback.activeForm === own.current?.form;
  return <RouterForm {...props} aria-busy={active || undefined} onSubmit={event => {
    onSubmit?.(event);
    if (event.defaultPrevented || !mutation) return;
    const form = event.currentTarget;
    const native = event.nativeEvent as SubmitEvent;
    const submitter = native.submitter as HTMLButtonElement | HTMLInputElement | null;
    const fields = new FormData(form, submitter);
    if (!feedback.begin({ form, action: submitter?.hasAttribute("formaction") ? submitter.formAction : form.action, intent: String(fields.get("intent") ?? ""), reset: resetOnSuccess, scroll: scrollOnSuccess, before: result })) { event.preventDefault(); return; }
    own.current = { form, before: result };
  }}>
    <FormPending.Provider value={active}>{children}</FormPending.Provider>
    {active && <p className="submission-progress" role="status"><span className="submission-spinner" aria-hidden="true" /> Submitting...</p>}
  </RouterForm>;
}
