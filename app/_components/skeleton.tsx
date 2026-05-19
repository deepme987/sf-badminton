'use client';

/**
 * Skeleton primitives — single pulsing rectangles that match the Sheet
 * aesthetic. No shimmer, no waves. Used to occupy space while async data
 * resolves on the client side.
 *
 * Design rules:
 *   - bg-rule-soft for the pulse fill (works in both themes via tokens).
 *   - rounded-md to match the Sheet's overall radius.
 *   - height in px so the placeholder occupies the exact final row height.
 *   - tabular-nums-friendly widths for numeric placeholders (keeps the layout
 *     from jumping when real data arrives).
 *
 * IMPORTANT: every skeleton must use aria-hidden so screen readers don't
 * announce a placeholder. The `role="status"` lives on the wrapping component
 * that owns the loading state.
 */

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-pulse bg-rule-soft rounded-md align-middle ${className}`}
      style={style}
    />
  );
}

/**
 * Mirrors the `.sheet-row-upcoming` and `.sheet-row-past` row layouts. We
 * render a single column that fills the row's left edge plus a numeric
 * placeholder on the right — minimal noise, matches what an upcoming row
 * looks like before status pills resolve.
 */
export function SessionCardSkeleton() {
  return (
    <div
      role="presentation"
      className="sheet-row sheet-row-upcoming"
      style={{ minHeight: 56 }}
    >
      <div className="min-w-0">
        <Skeleton className="block" width={120} height={14} />
        <Skeleton className="block mt-1.5" width={84} height={11} />
      </div>
      <div className="min-w-0">
        <Skeleton className="block" width={110} height={13} />
      </div>
      <div className="col-courts num-right">
        <Skeleton className="ml-auto block" width={20} height={13} />
      </div>
      <div className="col-status">
        <Skeleton className="block" width={72} height={13} />
      </div>
      <div className="num-right">
        <Skeleton className="ml-auto block" width={100} height={13} />
      </div>
    </div>
  );
}

/**
 * Roster row placeholder. Matches `.sheet-row-roster` grid (# | name | tag | joined).
 */
export function SlotRowSkeleton() {
  return (
    <div className="sheet-row sheet-row-roster" style={{ minHeight: 40 }}>
      <div className="num-right">
        <Skeleton className="ml-auto block" width={14} height={11} />
      </div>
      <div className="min-w-0">
        <Skeleton className="block" width={120} height={13} />
      </div>
      <div>
        <Skeleton className="block" width={42} height={14} />
      </div>
      <div className="col-joined num-right">
        <Skeleton className="ml-auto block" width={48} height={11} />
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for the session-detail metadata strip
 * ("4 confirmed / 6 · 2 waiting · Total $86.40 · Copy roster").
 */
export function MetaStripSkeleton() {
  return (
    <div className="meta-strip mb-6">
      <Skeleton width={92} height={13} />
      <Skeleton width={80} height={13} />
      <Skeleton width={110} height={13} />
    </div>
  );
}

/**
 * Placeholder that mirrors the OnboardingCard footprint so the home page
 * doesn't reflow when identity resolves. Centered, max-width md, with a
 * heading line + paragraph + input + button outline.
 */
export function OnboardingCardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="pt-2 mx-auto max-w-md md:pt-12">
      <Skeleton className="block mb-3" width={140} height={26} />
      <Skeleton className="block mb-1" width="92%" height={14} />
      <Skeleton className="block mb-6" width="74%" height={14} />
      <Skeleton className="block mb-1.5" width={68} height={11} />
      <Skeleton className="block mb-4" width="100%" height={40} />
      <Skeleton className="block" width="100%" height={36} />
    </div>
  );
}

/**
 * Composite skeleton: a sheet header + N row skeletons. Used by the Home
 * page when we don't yet know if there are upcoming sessions to render.
 */
export function UpcomingListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading sessions" className="sheet mb-10">
      <div className="sheet-row-head sheet-row-upcoming">
        <div>When</div>
        <div>Venue</div>
        <div className="col-courts num-right">Courts</div>
        <div className="col-status">Status</div>
        <div className="num-right">Spots / Waiting</div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <SessionCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Thin top progress bar used to indicate a background refetch is in flight.
 * Lives fixed to the top of the viewport, just below the AppBar. Auto-fades
 * via the `animate-fade-in` keyframe.
 */
export function TopProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-50 h-0.5 animate-fade-in"
      style={{ background: 'var(--accent)' }}
    />
  );
}
