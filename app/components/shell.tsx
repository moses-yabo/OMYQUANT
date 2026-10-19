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
export function Shell({ children }: { children: React.ReactNode }) {
  const [search] = useSearchParams();
  const current = search.get("section") ?? "all";
  const location = useLocation();
  const root = useRouteLoaderData<{
    user: { id?: string; name: string } | null;
    demo?: boolean;
  }>("root");
  const [connected, setConnected] = useState(false);
  const { revalidate } = useRevalidator();
  const refreshRef = useRef(revalidate);
  refreshRef.current = revalidate;
  useEffect(() => {
    if (!root?.demo || !root.user) { setConnected(false); return; }
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
              className={`nav-item ${current === s.id && location.pathname === "/" ? "selected" : ""}`}
              to={`/?section=${s.id}`}
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
          <Link className="nav-item" to="/?saved=1">
            <Icon name="heart" />
            Saved listings
          </Link>
          <NavLink className="nav-item" to="/business">
            <Icon name="store" />
            My business
          </NavLink>
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
            <span className="location">
              <Icon name="pin" size={16} /> South Africa
            </span>
            <Link className="sign-in" to={root?.user ? "/account" : "/login"}>
              <Icon name="user" size={17} />
              {root?.user ? root.user.name.split(" ")[0] : "Sign in"}
            </Link>
            <Link className="button small" to="/business">
              List your business <span>+</span>
            </Link>
          </div>
        </header>
        {navigation.state !== "idle" && (
          <div
            className="navigation-progress"
            role="progressbar"
            aria-label="Loading page"
          />
        )}
        <main id="main-content">{children}</main>
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
