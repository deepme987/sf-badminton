'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  getStoredMode,
  resolveCurrent,
  resolveMode,
  setStoredMode,
  THEME_MEDIA_QUERY,
  type ResolvedTheme,
  type ThemeMode,
} from './theme';

interface UseThemeResult {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Whether we've hydrated and read localStorage. Use to gate UI that
   * depends on the actual mode (e.g. a segmented selector). */
  isReady: boolean;
}

/**
 * Read + write the active theme. Mirrors system-color changes when the mode
 * is 'system'. The FOUC inline script handles initial paint, but we still
 * call applyTheme() on mount to reconcile against the (possibly newer) value
 * read from localStorage.
 */
export function useTheme(): UseThemeResult {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');
  const [isReady, setIsReady] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const stored = getStoredMode();
    setModeState(stored);
    applyTheme(stored);
    setResolved(resolveCurrent());
    setIsReady(true);
  }, []);

  // Reflect system changes when mode === 'system'.
  useEffect(() => {
    if (mode !== 'system') return;
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(THEME_MEDIA_QUERY);
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveMode('system'));
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setStoredMode(next);
    setModeState(next);
    setResolved(resolveMode(next));
  }, []);

  return { mode, resolved, setMode, isReady };
}
