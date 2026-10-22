import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { resolvedTheme, themePreference, themeStorageKey, type ThemePreference } from '../lib/theme';

const ThemeContext = createContext<{ preference: ThemePreference; choose: (value: ThemePreference) => void }>({ preference: 'system', choose: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let current: ThemePreference = 'system';
    try { current = themePreference(localStorage.getItem(themeStorageKey)); } catch { /* Theme still works when storage is unavailable. */ }
    const apply = () => { document.documentElement.dataset.theme = resolvedTheme(current, media.matches); };
    const sync = (event: StorageEvent) => {
      if (event.key !== themeStorageKey && event.key !== null) return;
      current = themePreference(event.newValue); setPreference(current); apply();
    };
    const change = (event: Event) => {
      current = themePreference((event as CustomEvent).detail); setPreference(current); apply();
    };
    setPreference(current); apply();
    media.addEventListener('change', apply);
    window.addEventListener('storage', sync);
    window.addEventListener('omyquant:theme', change);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('storage', sync);
      window.removeEventListener('omyquant:theme', change);
    };
  }, []);
  function choose(value: ThemePreference) {
    try { localStorage.setItem(themeStorageKey, value); } catch { /* Keep the in-memory choice. */ }
    window.dispatchEvent(new CustomEvent('omyquant:theme', { detail: value }));
  }
  return <ThemeContext.Provider value={{ preference, choose }}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle() {
  const { preference, choose } = useContext(ThemeContext);
  return <label className="theme-control"><span>Theme</span><select aria-label="Color theme" value={preference} onChange={event => choose(themePreference(event.target.value))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
