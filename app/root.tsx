import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  redirect,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { api, result } from "./.server/frontend";
import { demoEnabled } from "./.server/demo-mode";
import { sessionToken } from './.server/modules/auth/auth';
import type { Tool } from './.server/modules/business-tools';

export async function loader({ request }: Route.LoaderArgs) {
  if (demoEnabled()) return { user: null, demo: true };
  if (!await sessionToken(request))
    return { user: null, demo: demoEnabled() };
  const response = await api(request, "users/me");
  if (!response.ok && response.status !== 401) throw new Response('Unable to verify your account. Please try again shortly.', { status: response.status, statusText: 'Unable to verify your account. Please try again shortly.' });
  const payload = await result<{ id: string; name: string; admin?: boolean; superAdmin?: boolean }>(response);
  const pathname = new URL(request.url).pathname;
  if (response.ok && payload.data?.superAdmin && pathname !== '/admin' && !pathname.startsWith('/admin/')) throw redirect('/admin');
  let workspaces: { id: string; name: string; tools: Tool[] }[] = [];
  if (response.ok && payload.data && !payload.data.admin && !payload.data.superAdmin) {
    const access = await api(request, 'business-workspaces');
    if (!access.ok) throw new Response('Unable to verify business access', { status: access.status });
    workspaces = (await result<typeof workspaces>(access)).data ?? [];
    const businessPage = pathname === '/business' || pathname.startsWith('/business/') || pathname === '/work' || pathname === '/support' || pathname.startsWith('/support/');
    if (workspaces.length && !businessPage) throw redirect(`/business/${workspaces[0].id}/tools`);
  }
  return {
    workspaces,
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
// Root role data must not remain cached across client-side navigation after a
// grant/revocation. Server loaders and protected APIs remain authoritative.
export function shouldRevalidate() { return true; }
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
