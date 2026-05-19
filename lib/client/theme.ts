/**
 * Light/dark theme switching. Persists to localStorage and reflects on
 * <html data-theme="light|dark">. The FOUC-prevention inline script in
 * app/layout.tsx applies the initial value before first paint; this module
 * handles runtime changes.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'vibe.theme';

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Default mode when nothing is persisted is `light`. The 3-way picker in
 * /profile lets the user opt into `dark` or `system`. This matches the
 * FOUC-prevention script in app/layout.tsx — keep them in sync.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_THEME_MODE;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function setStoredMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (private mode, etc.) — ignore.
  }
  applyTheme(mode);
}

export function resolveMode(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveMode(mode);
  document.documentElement.setAttribute('data-theme', resolved);
}

export function resolveCurrent(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

export { MEDIA_QUERY as THEME_MEDIA_QUERY };
