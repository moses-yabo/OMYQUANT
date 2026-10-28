export function customerMobileTabs(pathname: string, search: string, hash: string, signedIn: boolean) {
  const saved = new URLSearchParams(search).has("saved");
  return [
    { label: "Marketplace", icon: "grid", to: "/", active: pathname === "/" && !saved },
    { label: "Saved", icon: "heart", to: "/?saved=1#listings", active: pathname === "/" && saved },
    { label: "Activity", icon: "clock", to: "/account#orders", active: pathname === "/account" && Boolean(hash) },
    { label: "Account", icon: "user", to: signedIn ? "/account" : "/login", active: (pathname === "/account" && !hash) || pathname === "/login" || pathname === "/register" },
  ];
}
