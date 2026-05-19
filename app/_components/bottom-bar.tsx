'use client';

import type { ReactNode } from 'react';

interface BottomBarProps {
  children: ReactNode;
}

/**
 * Sticky bottom action bar. Lives in the thumb zone on mobile, which is
 * the only place a primary CTA should live on small screens.
 *
 * - Mobile: fixed to bottom of viewport, hairline rule on top.
 * - Desktop (md+): hidden — desktop CTAs live inline in the AppBar.
 *
 * Pages that render BottomBar must also give their <main> the
 * `has-bottom-bar` class (or equivalent bottom padding) so the last
 * content row isn't covered by the bar.
 *
 * The bottom inset uses env(safe-area-inset-bottom) so the iPhone home
 * indicator doesn't push the CTA up over it. Inline style is used here
 * because Tailwind 4 needs a runtime token for env() and arbitrary values
 * fight with prettier-plugin-tailwindcss.
 */
export function BottomBar({ children }: BottomBarProps) {
  return (
    <div
      data-bottom-bar=""
      className="fixed inset-x-0 bottom-0 z-30 md:hidden bg-surface border-t border-rule"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="max-w-4xl mx-auto px-4 pt-3 flex items-center gap-2">{children}</div>
    </div>
  );
}
