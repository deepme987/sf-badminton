'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  clearIdentity as clearIdentityLs,
  ensureIdentity,
  readIdentity,
  writeIdentity,
  type Identity,
} from './identity';

/**
 * Hook for components that need the current device identity.
 *
 * `isReady` is false on the first render (server + first client paint) and
 * flips to true after we hydrate from localStorage. Callers MUST gate any
 * identity-dependent UI on `isReady` to avoid hydration mismatches.
 *
 * Backing store is a module-level singleton with a subscription list so
 * every consumer auto-syncs when any consumer mutates. Without this, two
 * components calling `useIdentity()` each got their own `useState` and
 * diverged: e.g. a name-prompt modal could call `setName`, write to
 * localStorage, but the parent page's hook instance would still see
 * `null` and re-pop the modal forever.
 */
export interface UseIdentity {
  identity: Identity | null;
  isReady: boolean;
  setName: (name: string) => Identity;
  setHandles: (handles: { venmoHandle?: string; zelleHandle?: string }) => void;
  setLastVenue: (venue: string) => void;
  clear: () => void;
}

// ─── Module-level singleton store ────────────────────────────────────────
let cached: Identity | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getIdentitySnapshot(): Identity | null {
  return cached;
}

function getReadySnapshot(): boolean {
  return hydrated;
}

// Both server snapshots match the pre-hydration client state so
// `useSyncExternalStore` doesn't trip its SSR/CSR mismatch guard.
function getNullServerSnapshot(): Identity | null {
  return null;
}

function getFalseServerSnapshot(): boolean {
  return false;
}

function commit(next: Identity | null): void {
  cached = next;
  notify();
}

// ─── Hook ─────────────────────────────────────────────────────────────────
export function useIdentity(): UseIdentity {
  const identity = useSyncExternalStore(
    subscribe,
    getIdentitySnapshot,
    getNullServerSnapshot,
  );
  const isReady = useSyncExternalStore(
    subscribe,
    getReadySnapshot,
    getFalseServerSnapshot,
  );

  // First mounted instance hydrates from localStorage. Subsequent
  // instances see `hydrated === true` and skip — the snapshot is
  // already current.
  useEffect(() => {
    if (hydrated) return;
    cached = readIdentity();
    hydrated = true;
    notify();
  }, []);

  const setName = useCallback((name: string): Identity => {
    const trimmed = name.trim();
    if (trimmed === '') throw new Error('display name cannot be empty');
    const next = ensureIdentity(trimmed);
    commit(next);
    return next;
  }, []);

  const setHandles = useCallback(
    (handles: { venmoHandle?: string; zelleHandle?: string }) => {
      if (!cached) return;
      const next: Identity = {
        ...cached,
        venmoHandle:
          handles.venmoHandle === undefined
            ? cached.venmoHandle
            : handles.venmoHandle.trim() || undefined,
        zelleHandle:
          handles.zelleHandle === undefined
            ? cached.zelleHandle
            : handles.zelleHandle.trim() || undefined,
      };
      writeIdentity(next);
      commit(next);
    },
    [],
  );

  const setLastVenue = useCallback((venue: string) => {
    if (!cached) return;
    const next: Identity = { ...cached, lastVenue: venue };
    writeIdentity(next);
    commit(next);
  }, []);

  const clear = useCallback(() => {
    clearIdentityLs();
    commit(null);
  }, []);

  return { identity, isReady, setName, setHandles, setLastVenue, clear };
}
