'use client';

/**
 * Tiny "Updated Xs ago" chip. Re-renders every second up to the 60s mark and
 * then every 30s so the label keeps reading "Updated 12s ago" rather than
 * silently going stale. The pill is deliberately quiet (text-ink-faint) so
 * it doesn't compete with content.
 *
 * Pass `at = null` while the first fetch is in flight to render nothing.
 */
import { useEffect, useState } from 'react';

interface Props {
  at: number | null;
}

export function LastUpdated({ at }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    // Pick the next tick interval based on how stale we already are. Within
    // the first minute we tick every second; past that, every 30s is enough
    // — the label switches to "Xm ago" granularity and per-second updates
    // would just churn the DOM.
    const elapsed = at === null ? 0 : now - at;
    const interval = elapsed < 60_000 ? 1_000 : 30_000;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [at, now]);

  if (at === null) return null;
  return (
    <span className="t-small text-ink-faint tnum" aria-live="polite">
      Updated {formatElapsed(now - at)}
    </span>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 5_000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
