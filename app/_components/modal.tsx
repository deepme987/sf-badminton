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
 * Bottom sheet on mobile, centered modal on desktop. Tokens are theme-aware:
 * surface, rule, ink, ink-soft all swap on light/dark toggle.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissOnBackdrop = true,
}: ModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
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
