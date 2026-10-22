export type ThemePreference = 'system' | 'light' | 'dark';
export const themeStorageKey = 'omyquant:theme';
export function themePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolvedTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
// Runs in the document head before content paints; no account data is stored.
export const themeBootstrap = `(()=>{let preference='system';try{const saved=localStorage.getItem('${themeStorageKey}');if(saved==='light'||saved==='dark')preference=saved}catch{}const dark=preference==='dark'||(preference==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'})()`;
