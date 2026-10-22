import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { connectTheme, themePreference, type ThemePreference } from '../lib/theme';

const ThemeContext = createContext<{ preference: ThemePreference; choose: (value: ThemePreference) => void }>({ preference: 'system', choose: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const controller = useRef<ReturnType<typeof connectTheme> | null>(null);
  useEffect(() => {
    controller.current = connectTheme(setPreference);
    return () => { controller.current?.dispose(); controller.current = null; };
  }, []);
  function choose(value: ThemePreference) {
    controller.current?.choose(value);
  }
  return <ThemeContext.Provider value={{ preference, choose }}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle() {
  const { preference, choose } = useContext(ThemeContext);
  return <label className="theme-control"><span>Theme</span><select aria-label="Color theme" value={preference} onChange={event => choose(themePreference(event.target.value))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
