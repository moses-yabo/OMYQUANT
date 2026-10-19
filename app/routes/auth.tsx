import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/auth";
import { Shell } from "../components/shell";
import { Icon } from "../components/icon";
import { api, mutationOrigin, result } from "../.server/frontend";
export function loader({ params }: Route.LoaderArgs) {
  if (!["login", "register"].includes(params.mode))
    throw new Response("Page not found", { status: 404 });
  return null;
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
export default function Auth({ params, actionData }: Route.ComponentProps) {
  const register = params.mode === "register";
  const navigation = useNavigation();
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
          <Form method="post">
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
