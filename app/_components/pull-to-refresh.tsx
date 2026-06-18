'use client';

/**
 * Wrapper that surfaces a pull-to-refresh affordance above its children.
 *
 * The wrapper itself doesn't scroll — the document does. We just attach the
 * touch handlers to a fixed-position wrapper at the top of the page so the
 * gesture is detected anywhere within the page bounds. The visual indicator
 * lives in a fixed band that fades and rotates with `pull`, then spins while
 * `refreshing`.
 *
 * Why no overscroll/preventDefault: iOS Safari's native bounce already
 * provides the rubber-band feel. Stealing the touch events to translate the
 * page causes jitter and breaks scroll-momentum on the way back up.
 */
import { useRef, type ReactNode } from 'react';
import { usePullToRefresh } from '@/lib/client/use-pull-to-refresh';

interface Props {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { pull, refreshing } = usePullToRefresh(ref, onRefresh);

  // Indicator translates down with the pull and fades in proportionally. Once
  // we cross the threshold (pull >= 1) the arrow rotates 180° to signal
  // "release to refresh". While refreshing we render a spinner instead.
  const visible = pull > 0.05 || refreshing;
  const translateY = refreshing ? 56 : Math.min(56, pull * 56);
  const opacity = refreshing ? 1 : Math.min(1, pull);
  const arrowRotate = pull >= 1 ? 180 : 0;

  return (
    <div ref={ref}>
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed left-0 right-0 top-12 z-20 flex justify-center"
        style={{
          transform: `translateY(${translateY - 56}px)`,
          opacity,
          transition: refreshing ? 'transform 200ms ease-out' : 'none',
        }}
      >
        <div className="bg-surface border border-rule rounded-full shadow-sm h-9 w-9 flex items-center justify-center">
          {refreshing ? <Spinner /> : <Arrow rotate={arrowRotate} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function Arrow({ rotate }: { rotate: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 150ms ease-out' }}
      aria-hidden="true"
    >
      <path
        d="M7 1.5v9.5M3 7l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path
        d="M12.5 7a5.5 5.5 0 0 1-5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
