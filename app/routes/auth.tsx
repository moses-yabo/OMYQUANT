import { Form, Link, data, redirect, useNavigation } from "react-router";
import { useState } from 'react';
import '../components/google-button.css';
import type { Route } from "./+types/auth";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { api, mutationOrigin, result } from "../.server/frontend";
import { demoEnabled } from '../.server/demo-mode';
import { googleAvailability } from '../.server/modules/auth/google-provider';
import { AuthIdentity, User } from '../.server/database/models';
const googleMessages: Record<string, string> = {
  account_exists: 'Sign in with your existing account first, then return to this page to link Google. Accounts are never linked just because their emails match.',
  reauthenticate: 'Please sign in again with your existing password before linking Google.',
  unavailable: 'Google sign-in is unavailable. Check the server configuration or use your existing sign-in method.',
  failed: 'Google sign-in was cancelled, expired or could not be verified. Please try again.',
};
export async function loader({ params, request }: Route.LoaderArgs) {
  if (!["login", "register"].includes(params.mode))
    throw new Response("Page not found", { status: 404 });
  const google = googleAvailability(request);
  let canLink = false;
  if (google.enabled && request.headers.get('Cookie')) {
    const me = await api(request, 'users/me');
    if (me.ok) {
      const current = await result<{ _id: string }>(me);
      if (current.data) {
        const [hasPassword, linked] = await Promise.all([
          User.exists({ _id: current.data._id, passwordHash: { $type: 'string' } }),
          AuthIdentity.exists({ user: current.data._id, provider: 'google' }),
        ]);
        canLink = Boolean(hasPassword && !linked);
      }
    }
  }
  return data({ local: demoEnabled(), google, canLink, googleError: googleMessages[new URL(request.url).searchParams.get('google') ?? ''] ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
}
export function meta() {
  return [{ title: "Your account | OMYQUANT" }];
}
export async function action({ request, params }: Route.ActionArgs) {
  mutationOrigin(request);
  if (!["login", "register"].includes(params.mode))
    throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const payload = {
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    ...(params.mode === "register"
      ? { name: String(form.get("name") ?? "") }
      : {}),
  };
  const response = await api(request, `auth/${params.mode}`, "POST", payload);
  const parsed = await result(response);
  if (!response.ok)
    return data(
      {
        error:
          parsed.error?.issues
            ?.map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · ") ??
          parsed.error?.message ??
          "Please try again.",
      },
      { status: response.status },
    );
  if (params.mode === "register") return redirect("/login?registered=1");
  return redirect("/account", {
    headers: {
      "Set-Cookie": response.headers.get("Set-Cookie")!,
      "Cache-Control": "no-store",
    },
  });
}
export async function clientAction({ request, serverAction, params }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  if (form.get('local') !== 'true') return serverAction();
  const { registerBrowser, loginBrowser, browserAuthError } = await import('../lib/browser-auth');
  try {
    const input = { email: String(form.get('email')), password: String(form.get('password')) };
    if (params.mode === 'register') { await registerBrowser({ ...input, name: String(form.get('name')) }); return redirect('/login?registered=1'); }
    await loginBrowser(input); return redirect('/account');
  } catch (error) { return { error: browserAuthError(error) }; }
}
export default function Auth({ params, actionData, loaderData }: Route.ComponentProps) {
  const register = params.mode === "register";
  const navigation = useNavigation();
  const [googlePending, setGooglePending] = useState(false);
  return (
    <Shell>
      <div className="form-page auth-layout">
        <div className="auth-story">
          <div className="story-icon">
            <Icon name="leaf" size={32} />
          </div>
          <span className="eyebrow">YOUR COMMUNITY IS WAITING</span>
          <h1>
            A world of local
            <br />
            possibilities.
          </h1>
          <p>
            Fresh finds, new journeys, and people who make things happen. Your
            next connection starts here.
          </p>
          <Link className="button outline" to="/" style={{ marginTop: 24 }}>
            Explore the marketplace <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="form-panel">
          <h2>{register ? "Make yourself at home" : "Welcome back"}</h2>
          <p className="muted">
            {register
              ? "Create your OMYQUANT account."
              : "Sign in to pick up where you left off."}
          </p>
          {actionData?.error && (
            <p role="alert" className="notice error">
              {actionData.error}
            </p>
          )}
          {loaderData.googleError && <p role="alert" className="notice error">{loaderData.googleError}</p>}
          <Form method="post" action="/auth/google" reloadDocument onSubmit={() => setGooglePending(true)}>
            <input type="hidden" name="intent" value={loaderData.canLink ? 'link' : 'login'} />
            {loaderData.canLink && <label>Confirm your existing password to link Google<input name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label>}
            <button type="submit" className="button full google-auth-button" disabled={!loaderData.google.enabled || googlePending} aria-busy={googlePending} aria-describedby={!loaderData.google.enabled ? 'google-unavailable' : undefined}>
              <img className="google-auth-logo" src="/images/google-g.png" width="20" height="20" alt="" aria-hidden="true" />
              <span aria-live="polite">{googlePending ? 'Connecting to Google…' : loaderData.canLink ? 'Link Google to your account' : 'Continue with Google'}</span>
            </button>
            {!loaderData.google.enabled && <p id="google-unavailable" className="muted">{loaderData.google.reason}</p>}
          </Form>
          <Form method="post">
            <input type="hidden" name="local" value={String(loaderData.local)}/>
            {loaderData.local && <p className="notice">Browser-only demo account. Saved in localStorage on this browser; not server-verified authentication.</p>}
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Full name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={12}
                maxLength={128}
                placeholder="At least 12 characters"
              />
            </label>
            <button
              className="button full"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state !== "idle"
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Sign in"}
              <Icon name="arrow" size={16} />
            </button>
          </Form>
          <p className="auth-switch">
            {register ? "Already part of the community?" : "New to OMYQUANT?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </Shell>
  );
}
