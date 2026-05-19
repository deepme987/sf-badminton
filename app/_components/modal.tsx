'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * If true, clicking the backdrop closes the modal. Defaults to true.
   * Set to false for irreversible flows (e.g., mid-submit).
   */
  dismissOnBackdrop?: boolean;
}

/**
 * Selector for everything we treat as "focusable inside the dialog." Mirrors
 * the standard tabbable-elements list. Visibility (offsetParent !== null) is
 * checked at runtime so we skip hidden inputs / display:none branches.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Bottom sheet on mobile, centered modal on desktop. Tokens are theme-aware:
 * surface, rule, ink, ink-soft all swap on light/dark toggle.
 *
 * Focus management: on open, we capture the previously-focused element and
 * move focus into the dialog (first focusable, or the close button as a
 * fallback). Tab / Shift+Tab at the boundaries cycle within the dialog. On
 * close, focus is restored to the originally-focused element. Escape closes
 * the dialog. This is a hand-rolled focus trap — no `react-focus-lock` dep.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissOnBackdrop = true,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Defer initial focus until after the dialog content is in the DOM and
    // any `autoFocus` inputs inside the children have had a tick to claim
    // focus themselves. If nothing inside claimed focus, fall back to the
    // first focusable, then the close button.
    const initialFocusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (dialog.contains(document.activeElement)) return;
      const focusables = getFocusable(dialog);
      // Skip the close button as the FIRST choice — most modals have a
      // primary CTA or input that's more useful as the initial focus target.
      const initial =
        focusables.find((el) => el !== closeRef.current) ??
        closeRef.current ??
        focusables[0] ??
        null;
      initial?.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = getFocusable(dialog);
      if (focusables.length === 0) {
        // Nothing tabbable — keep focus pinned to the dialog itself.
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // `focusables.length === 0` was handled above, so first/last are defined.
      // The TS narrow doesn't carry past the early-return, so re-guard here.
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;

      // If focus has somehow escaped the dialog (e.g. browser tab-cycled
      // back to the document root), pull it back in.
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(initialFocusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus only if the previously-focused element is still
      // connected. A common path: an element that triggered the modal was
      // itself removed from the DOM while the modal was open (e.g. a slot
      // row that got optimistically dropped). In that case, don't try to
      // refocus a dead node — let the browser pick up the next sensible
      // target.
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus?.();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={title}
      className="fixed inset-0 z-40 flex flex-col items-stretch justify-end md:items-center md:justify-center"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={dismissOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/50 animate-fade-in"
      />
      <div
        ref={dialogRef}
        className="relative bg-surface border border-rule rounded-t-md md:rounded-md w-full md:max-w-md max-h-[95vh] overflow-y-auto animate-slide-up md:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="px-5 pt-3 md:pt-5">
          <div className="flex items-start justify-between mb-4">
            <h2 className="t-section text-ink">{title}</h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-link -mr-1 -mt-1 h-11 w-11 flex items-center justify-center rounded-md"
            >
              <span className="text-base leading-none">×</span>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
