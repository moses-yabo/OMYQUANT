import {
  SubmissionForm as Form,
  SubmissionButton,
  useSubmissionOutcome,
} from "./submission-feedback";
import { ThemeToggle } from "./theme";
import {
  Link,
  NavLink,
  useLocation,
  useNavigation,
  useSearchParams,
  useRouteLoaderData,
  useRevalidator,
} from "react-router";
import { useEffect, useState, useRef } from "react";
import { Icon } from "./icon";
import { sections } from "../lib/marketplace";
import { NotificationSettings } from "./notification-settings";
import { SupportChat } from "./support-chat";
import { SupportActivityNotice } from "./support-live-updates";
import "./admin-navigation.css";
import { businessToolLabels } from "../lib/business-tools";
type Workspace = {
  business: { _id: string; name: string };
  available: (keyof typeof businessToolLabels)[];
};
export function Shell({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace?: Workspace;
}) {
  useSubmissionOutcome();
  const [search] = useSearchParams();
  const current = search.get("section") ?? "all";
  const location = useLocation();
  const root = useRouteLoaderData<{
    user: {
      _id?: string;
      id?: string;
      name: string;
      admin?: boolean;
      superAdmin?: boolean;
    } | null;
    demo?: boolean;
    workspaces?: {
      id: string;
      name: string;
      tools: (keyof typeof businessToolLabels)[];
    }[];
  }>("root");
  const selectedWorkspace =
    root?.workspaces?.find((item) =>
      location.pathname.startsWith(`/business/${item.id}/`),
    ) ?? root?.workspaces?.[0];
  workspace ??= selectedWorkspace
    ? {
        business: { _id: selectedWorkspace.id, name: selectedWorkspace.name },
        available: selectedWorkspace.tools,
      }
    : undefined;
  const [connected, setConnected] = useState(false);
  const { revalidate } = useRevalidator();
  const refreshRef = useRef(revalidate);
  refreshRef.current = revalidate;
  useEffect(() => {
    if (!root?.demo || !root.user) {
      setConnected(false);
      return;
    }
    let cleanup: (() => void) | undefined;
    let stopped = false;
    import("../lib/local-bookings")
      .then(({ connectLocalRealtime }) => {
        if (!stopped)
          cleanup = connectLocalRealtime(() => {
            void refreshRef.current();
          }, setConnected);
      })
      .catch(() => setConnected(false));
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, [root?.demo, root?.user?.id]);
  const navigation = useNavigation();
  const isSuperAdmin = !root?.demo && Boolean(root?.user?.superAdmin);
  const isAdmin =
    !root?.demo && Boolean(root?.user?.admin || root?.user?.superAdmin);
  const categoryActivity =
    current === "products" || current === "livestock"
      ? { label: "My orders", to: "/account#orders" }
      : current === "taxis"
        ? { label: "My trips", to: "/account#bookings" }
        : current === "trailers"
          ? { label: "My rentals", to: "/account#reservations" }
          : null;
  const primaryAction =
    location.pathname === "/"
      ? (categoryActivity ?? { label: "List your business", to: "/business" })
      : { label: "Explore marketplace", to: "/" };
  if (isSuperAdmin || (isAdmin && location.pathname.startsWith("/admin")))
    return (
      <div className="app-shell super-admin-shell">
        <aside className="sidebar">
          <Link
            to={isSuperAdmin ? "/admin" : "/admin/businesses"}
            className="brand"
          >
            <span className="brand-mark">
              <Icon name="leaf" size={24} />
            </span>
            OMYQUANT<span className="brand-dot">.</span>
          </Link>
          <div className="nav-label">
            {isSuperAdmin ? "SUPER ADMINISTRATION" : "ADMINISTRATION"}
          </div>
          <nav aria-label="Administration workspace">
            <NavLink className="nav-item" to="/admin/support">
              <Icon name="box" />
              Support complaints
            </NavLink>
            {isSuperAdmin && (
              <NavLink className="nav-item" to="/admin" end>
                <Icon name="grid" />
                Overview
              </NavLink>
            )}
            <NavLink className="nav-item" to="/admin/businesses">
              <Icon name="store" />
              Verify businesses
            </NavLink>
            <NavLink className="nav-item" to="/admin/map">
              <Icon name="pin" />
              Business map
            </NavLink>
            {isSuperAdmin && (
              <NavLink className="nav-item" to="/admin/users">
                <Icon name="user" />
                Manage administrators
              </NavLink>
            )}
          </nav>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <span className="topbar-label">Platform oversight</span>
            <div className="topbar-actions">
              <ThemeToggle />
              <span className="sign-in">
                <Icon name="user" size={17} />
                {root?.user?.name}
              </span>
              <Form method="post" action="/account">
                <input type="hidden" name="intent" value="logout" />
                <SubmissionButton className="button outline small">
                  Sign out
                </SubmissionButton>
              </Form>
            </div>
          </header>
          {navigation.state !== "idle" && (
            <div
              className="navigation-progress"
              role="progressbar"
              aria-label="Loading page"
            />
          )}
          {!location.pathname.startsWith("/admin/support") && (
            <SupportActivityNotice />
          )}
          <main id="main-content" aria-busy={navigation.state !== "idle"}>
            {children}
          </main>
          <footer className="footer">
            <span>© {new Date().getFullYear()} OMYQUANT</span>
            <span>
              {isSuperAdmin
                ? "Super administrator workspace"
                : "Administrator workspace"}
            </span>
          </footer>
        </div>
      </div>
    );
  if (workspace)
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <Link
            className="brand"
            to={`/business/${workspace.business._id}/tools`}
          >
            <span className="brand-mark">
              <Icon name="store" size={24} />
            </span>
            OMYQUANT<span className="brand-dot">.</span>
          </Link>
          <div className="nav-label">BUSINESS WORKSPACE</div>
          <nav aria-label="Business management">
            <Link
              className={`nav-item ${!search.has("tool") ? "selected" : ""}`}
              to={`/business/${workspace.business._id}/tools`}
            >
              Business overview
            </Link>
            {workspace.available.map((tool) => (
              <Link
                key={tool}
                className={`nav-item ${search.get("tool") === tool ? "selected" : ""}`}
                to={`/business/${workspace.business._id}/tools?tool=${tool}`}
              >
                {businessToolLabels[tool]}
              </Link>
            ))}
            <Link
              className="nav-item"
              to={`/business/${workspace.business._id}/profile`}
            >
              Business profile and team
            </Link>
            <Link className="nav-item" to="/business?view=all">
              My businesses
            </Link>
            <Link className="nav-item" to="/business?register=1">
              Register another business
            </Link>
            <Link className="nav-item" to="/work">
              My driver assignments
            </Link>
            <Link className="nav-item" to="/support">
              Help and complaints
            </Link>
          </nav>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <span className="topbar-label">{workspace.business.name}</span>
            <div className="topbar-actions">
              <ThemeToggle />
              <Link className="button outline small" to="/business?view=all">
                Switch business
              </Link>
              <Form method="post" action="/account">
                <input type="hidden" name="intent" value="logout" />
                <SubmissionButton className="button outline small">
                  Sign out
                </SubmissionButton>
              </Form>
            </div>
          </header>
          {navigation.state !== "idle" && (
            <div
              className="navigation-progress"
              role="progressbar"
              aria-label="Loading page"
            />
          )}
          <main id="main-content" aria-busy={navigation.state !== "idle"}>
            {children}
          </main>
          <footer className="footer">
            <span>OMYQUANT</span>
            <span>Business management workspace</span>
          </footer>
        </div>
        {!isAdmin && (
          <SupportChat accountId={root?.user?._id ?? root?.user?.id} />
        )}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Icon name="leaf" size={24} />
          </span>
          OMYQUANT<span className="brand-dot">.</span>
        </Link>
        <div className="nav-label">YOUR EVERYDAY, CONNECTED</div>
        <nav aria-label="Marketplace">
          {sections.map((s) => (
            <Link
              key={s.id}
              className={`nav-item ${current === s.id && location.pathname === "/" && !search.has("saved") ? "selected" : ""}`}
              to={`/?section=${s.id}${s.id === "all" ? "" : "#listings"}`}
              aria-current={
                current === s.id &&
                location.pathname === "/" &&
                !search.has("saved")
                  ? "page"
                  : undefined
              }
            >
              <Icon name={s.icon} />
              {s.name}
              {s.id === "all" && <span className="tiny-dot" />}
            </Link>
          ))}
          <Link className="nav-item" to="/request/delivery">
            <Icon name="box" />
            Deliveries
          </Link>
        </nav>
        <div className="nav-divider" />
        <div className="nav-label">YOUR SPACE</div>
        <nav aria-label="Your account">
          <NavLink className="nav-item" to="/account">
            <Icon name="clock" />
            My activity
          </NavLink>
          <Link
            className={`nav-item ${location.pathname === "/" && search.has("saved") ? "selected" : ""}`}
            aria-current={
              location.pathname === "/" && search.has("saved")
                ? "page"
                : undefined
            }
            to="/?saved=1#listings"
          >
            <Icon name="heart" />
            Saved listings
          </Link>
          <NavLink className="nav-item" to="/business">
            <Icon name="store" />
            My businesses
          </NavLink>
          {isAdmin && (
            <NavLink className="nav-item" to="/admin/businesses">
              <Icon name="store" />
              Business verification
            </NavLink>
          )}
          {root?.user && (
            <NavLink
              className="nav-item"
              to={isAdmin ? "/admin/support" : "/support"}
            >
              <Icon name="box" />
              {isAdmin ? "Support complaints" : "Help and complaints"}
            </NavLink>
          )}
          {isSuperAdmin && (
            <NavLink className="nav-item" to="/admin/users">
              <Icon name="store" />
              Manage administrators
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="partner-card">
            <span className="partner-icon">
              <Icon name="leaf" />
            </span>
            <h3>Grow with OMYQUANT</h3>
            <p>Your business. More possibilities.</p>
            <Link to="/business">
              Become a partner <Icon name="arrow" size={16} />
            </Link>
          </div>
          <div className="south-africa">
            <span>🇿🇦</span> Proudly connecting South Africa
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="topbar-label">
            A little closer. A lot more possible.
          </span>
          <div className="topbar-actions">
            <ThemeToggle />
            <span className="location">
              <Icon name="pin" size={16} /> South Africa
            </span>
            <Link className="sign-in" to={root?.user ? "/account" : "/login"}>
              <Icon name="user" size={17} />
              {root?.user ? root.user.name.split(" ")[0] : "Sign in"}
            </Link>
            <Link className="button small" to={primaryAction.to}>
              {primaryAction.label} <Icon name="arrow" size={14} />
            </Link>
          </div>
        </header>
        {isAdmin && (
          <nav
            className="admin-navigation"
            aria-label="Administration shortcuts"
          >
            <span className="admin-navigation-role">
              {isSuperAdmin ? "Super administrator" : "Administrator"}
            </span>
            <NavLink className="button outline small" to="/admin/businesses">
              Verify businesses
            </NavLink>
            <NavLink className="button outline small" to="/admin/support">
              Support complaints
            </NavLink>
            {isSuperAdmin && (
              <NavLink className="button outline small" to="/admin/users">
                Manage administrators
              </NavLink>
            )}
          </nav>
        )}
        {navigation.state !== "idle" && (
          <div
            className="navigation-progress"
            role="progressbar"
            aria-label="Loading page"
          />
        )}
        <main id="main-content" aria-busy={navigation.state !== "idle"}>
          {children}
        </main>
        {!root?.demo && !isAdmin && (
          <SupportChat
            key={root?.user?.id ?? root?.user?._id ?? "guest"}
            accountId={root?.user?.id ?? root?.user?._id}
          />
        )}
        {root?.user && <NotificationSettings />}
        {root?.demo && (
          <p className="realtime-status" role="status">
            {connected
              ? "● Socket.IO connected · browser bookings update live"
              : "○ Socket.IO reconnecting · local bookings remain available"}
          </p>
        )}
        <footer className="footer">
          <span>© {new Date().getFullYear()} OMYQUANT</span>
          <span>Local people. Shared possibilities.</span>
          <Link to="/request/transport">
            Need group transport? <Icon name="arrow" size={14} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
