'use client';

import { useTheme } from '@/lib/client/use-theme';
import { IconButton } from './app-bar';
import { IconMoon, IconSun } from './icons';

/**
 * Quick light/dark toggle for the top app bar. Always sets an explicit mode
 * (never "system") — the 3-way picker in Profile is the way to opt back
 * into following the OS.
 *
 * Renders a 44x44 placeholder until the theme has hydrated, so the icon
 * doesn't flash the wrong glyph on first paint.
 */
export function ThemeToggle() {
  const { resolved, setMode, isReady } = useTheme();

  if (!isReady) {
    return <div className="h-11 w-11" aria-hidden="true" />;
  }

  const isDark = resolved === 'dark';
  const next = isDark ? 'light' : 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <IconButton aria-label={label} onClick={() => setMode(next)}>
      {isDark ? <IconMoon /> : <IconSun />}
    </IconButton>
  );
}
