import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { api, result } from "./.server/frontend";
import { demoEnabled } from "./.server/demo-mode";

export async function loader({ request }: Route.LoaderArgs) {
  if (demoEnabled()) return { user: null, demo: true };
  if (!request.headers.get("Cookie"))
    return { user: null, demo: demoEnabled() };
  const response = await api(request, "users/me");
  const payload = await result<{ id: string; name: string; admin?: boolean; superAdmin?: boolean }>(response);
  return {
    user: response.ok ? (payload.data ?? null) : null,
    demo: demoEnabled(),
  };
}
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaded = await serverLoader();
  if (!loaded.demo) return loaded;
  try { const { currentBrowserUser } = await import('./lib/browser-auth'); return { ...loaded, user: await currentBrowserUser() }; }
  catch { return { ...loaded, user: null }; }
}
clientLoader.hydrate = true as const;
export function headers() {
  return { "Cache-Control": "no-store" };
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/images/favicon.png?v=2" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-page">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="error-page-details">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
