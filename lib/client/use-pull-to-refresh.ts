'use client';

/**
 * Pull-to-refresh hook. Mobile-first, no deps.
 *
 * Attaches passive touch handlers to a target element. When the user drags
 * downward from the top of the scroll position past the threshold, `onRefresh`
 * fires. The hook surfaces a `pull` value (0..1.5) and a `refreshing` flag
 * so the caller can render a visual indicator.
 *
 * Design notes:
 *   - Only arms when `window.scrollY === 0` at touchstart. Avoids stealing
 *     pulls from the middle of a long list.
 *   - Uses `passive: true` listeners — we don't preventDefault. iOS Safari's
 *     overscroll bounce already provides the rubber-band; fighting it
 *     causes jitter and breaks browser scroll-momentum.
 *   - `pull` is `delta / THRESHOLD_PX` clamped to [0, 1.5]. The caller uses
 *     it for translateY / opacity / arrow rotation.
 *   - `refreshing` stays true for at least `MIN_SPINNER_MS` so very fast
 *     networks don't flash the indicator and confuse the user.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const { pull, refreshing } = usePullToRefresh(ref, () => refetch());
 *   return <div ref={ref}>...</div>;
 */
import { useEffect, useRef, useState } from 'react';

interface UsePullToRefresh {
  pull: number;
  refreshing: boolean;
}

const THRESHOLD_PX = 70;
const MIN_SPINNER_MS = 500;

export function usePullToRefresh(
  target: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown> | void,
): UsePullToRefresh {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Latest state mirrored into refs so the touch handlers (captured once per
  // effect pass) always read fresh values without resubscribing every render.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  pullRef.current = pull;
  refreshingRef.current = refreshing;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    let startY = 0;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      if (refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      armed = true;
      startY = t.clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const t = e.touches[0];
      if (!t) return;
      const delta = t.clientY - startY;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      const ratio = Math.min(1.5, delta / THRESHOLD_PX);
      setPull(ratio);
    };

    const onEnd = async () => {
      if (!armed) return;
      armed = false;
      const cur = pullRef.current;
      setPull(0);
      if (cur >= 1) {
        setRefreshing(true);
        refreshingRef.current = true;
        const start = performance.now();
        try {
          await onRefreshRef.current();
        } finally {
          const elapsed = performance.now() - start;
          if (elapsed < MIN_SPINNER_MS) {
            await new Promise((r) => setTimeout(r, MIN_SPINNER_MS - elapsed));
          }
          setRefreshing(false);
          refreshingRef.current = false;
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [target]);

  return { pull, refreshing };
}
