'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (text: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_TTL_MS = 3500;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = 'success') => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const id = nextId++;
    setToast({ id, text, tone });
    timeoutRef.current = setTimeout(() => {
      setToast((prev) => (prev && prev.id === id ? null : prev));
      timeoutRef.current = null;
    }, TOAST_TTL_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? <ToastBubble toast={toast} /> : null}
    </ToastContext.Provider>
  );
}

function ToastBubble({ toast }: { toast: ToastMessage }) {
  // 4-px accent bar on the left, color depends on tone.
  const accent =
    toast.tone === 'error'
      ? 'bg-danger'
      : toast.tone === 'info'
        ? 'bg-ink-soft'
        : 'bg-accent';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 inset-x-3 md:top-4 md:right-4 md:left-auto md:max-w-sm z-50 safe-top animate-slide-down"
    >
      <div className="relative flex items-stretch bg-surface border border-rule rounded-md shadow-lg overflow-hidden">
        <div className={`w-1 shrink-0 ${accent}`} aria-hidden="true" />
        <div className="px-3 py-2.5 flex-1 min-w-0">
          <div className="t-body text-ink">{toast.text}</div>
        </div>
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { show: () => undefined };
  }
  return ctx;
}
