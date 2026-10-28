export type ThemePreference = "system" | "light" | "dark";
export const themeStorageKey = "omyquant:theme";
export function themePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolvedTheme(
  preference: ThemePreference,
  systemDark: boolean,
) {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
// Runs in the document head before content paints; no account data is stored.
export const themeBootstrap = `(()=>{let preference='system';try{const saved=localStorage.getItem('${themeStorageKey}');if(saved==='light'||saved==='dark')preference=saved}catch{}const dark=preference==='dark'||(preference==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'})()`;

export function connectTheme(changed: (preference: ThemePreference) => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let preference: ThemePreference = "system";
  try {
    preference = themePreference(localStorage.getItem(themeStorageKey));
  } catch {
    /* Storage may be blocked. */
  }
  const apply = () => {
    document.documentElement.dataset.theme = resolvedTheme(
      preference,
      media.matches,
    );
  };
  const sync = (event: StorageEvent) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    preference = themePreference(event.newValue);
    changed(preference);
    apply();
  };
  changed(preference);
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", sync);
  return {
    choose(value: ThemePreference) {
      preference = themePreference(value);
      try {
        localStorage.setItem(themeStorageKey, preference);
      } catch {
        /* Keep the in-memory choice. */
      }
      changed(preference);
      apply();
    },
    dispose() {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", sync);
    },
  };
}
