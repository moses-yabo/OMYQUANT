export type SubmissionNotice = { title: string; message: string; error?: boolean };

// Only explicit action contracts count as confirmation; loader data never does.
export function submissionNotice(value: unknown, fallback = "Your changes have been saved."): SubmissionNotice | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const error = typeof result.error === "string" ? result.error : result.error && typeof result.error === "object" && "message" in result.error ? String(result.error.message) : "";
  if (error) return { title: "Submission unsuccessful", message: error, error: true };
  if (result.success === false) return null;
  if (result.success || ("error" in result && result.error === ""))
    return { title: "Submitted successfully", message: typeof result.success === "string" ? result.success : fallback };
  return null;
}

export function redirectNotice(action: string, destination: string, intent: string): SubmissionNotice | null {
  const target = new URL(destination, "https://local.invalid");
  const source = new URL(action, "https://local.invalid");
  const saved = target.searchParams.get("saved") === "1";
  if (saved && ((source.pathname.startsWith("/admin/businesses/") && target.pathname === source.pathname) ||
    (/^\/(admin\/)?support(?:\/|$)/.test(source.pathname) && /^\/(admin\/)?support\/[a-f0-9]{24}$/.test(target.pathname))))
    return { title: "Saved successfully", message: "Your submission has been saved." };
  if (["/register", "/login"].includes(source.pathname)) {
    if (target.pathname === "/login" && target.searchParams.get("registered") === "1")
      return { title: "Account created", message: "Your account is ready. Please sign in." };
    if (["/account", "/admin", "/admin/businesses", "/business"].includes(target.pathname) || /^\/business\/[a-f0-9]{24}\/tools$/.test(target.pathname))
      return { title: "Signed in successfully", message: "Welcome back." };
  }
  if (target.pathname === "/login" && intent === "logout")
    return { title: "Signed out", message: "You have been signed out." };
  if (target.pathname === "/login") return { title: "Sign in required", message: "Please sign in before submitting again. Your submission has not been confirmed.", error: true };
  return null;
}

export function scrollAfterSubmission() {
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
