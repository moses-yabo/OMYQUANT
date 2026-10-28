import { Link, useLocation } from "react-router";
import { customerMobileTabs } from "../lib/mobile-navigation";
import { Icon } from "./icon";
import "./mobile-navigation.css";

export function MobileNavigation({ signedIn }: { signedIn: boolean }) {
  const { pathname, search, hash } = useLocation();
  return <nav className="mobile-tabs" aria-label="Mobile navigation">
    {customerMobileTabs(pathname, search, hash, signedIn).map(tab =>
      <Link key={tab.label} to={tab.to} className={tab.active ? "mobile-tab active" : "mobile-tab"} aria-current={tab.active ? "page" : undefined}>
        <span className="mobile-tab-icon"><Icon name={tab.icon} size={22} /></span>
        <span>{tab.label}</span>
      </Link>,
    )}
  </nav>;
}
