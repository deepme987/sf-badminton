'use client';

import { useCallback, useEffect, useState } from 'react';
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
 */
export interface UseIdentity {
  identity: Identity | null;
  isReady: boolean;
  setName: (name: string) => Identity;
  setHandles: (handles: { venmoHandle?: string; zelleHandle?: string }) => void;
  setLastVenue: (venue: string) => void;
  clear: () => void;
}

export function useIdentity(): UseIdentity {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIdentity(readIdentity());
    setIsReady(true);
  }, []);

  const setName = useCallback((name: string): Identity => {
    const trimmed = name.trim();
    if (trimmed === '') throw new Error('display name cannot be empty');
    const next = ensureIdentity(trimmed);
    setIdentity(next);
    return next;
  }, []);

  const setHandles = useCallback(
    (handles: { venmoHandle?: string; zelleHandle?: string }) => {
      setIdentity((prev) => {
        if (!prev) return prev;
        const next: Identity = {
          ...prev,
          venmoHandle:
            handles.venmoHandle === undefined ? prev.venmoHandle : handles.venmoHandle.trim() || undefined,
          zelleHandle:
            handles.zelleHandle === undefined ? prev.zelleHandle : handles.zelleHandle.trim() || undefined,
        };
        writeIdentity(next);
        return next;
      });
    },
    [],
  );

  const setLastVenue = useCallback((venue: string) => {
    setIdentity((prev) => {
      if (!prev) return prev;
      const next: Identity = { ...prev, lastVenue: venue };
      writeIdentity(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    clearIdentityLs();
    setIdentity(null);
  }, []);

  return { identity, isReady, setName, setHandles, setLastVenue, clear };
}
