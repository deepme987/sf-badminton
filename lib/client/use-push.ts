'use client';

/**
 * Single source of truth for the Profile notifications toggle.
 *
 * Resolves the current PushStatus on mount, exposes `enable` / `disable`
 * actions, and rebroadcasts whatever the underlying lib/client/push.ts
 * helpers return. The hook is intentionally thin — it doesn't memoize
 * status across mounts because the SW/OS permission state can change out
 * from under us when the user touches browser settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPushStatus, subscribePush, unsubscribePush, type PushStatus } from './push';

export interface UsePush {
  status: PushStatus;
  /** False on first render; flips to true after the initial status check. */
  isReady: boolean;
  /** True while a subscribe/unsubscribe round-trip is in flight. */
  isBusy: boolean;
  enable: (deviceId: string) => Promise<void>;
  disable: (deviceId: string) => Promise<void>;
}

export function usePush(): UsePush {
  const [status, setStatus] = useState<PushStatus>('not-subscribed');
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const next = await getPushStatus();
      if (mountedRef.current) {
        setStatus(next);
        setIsReady(true);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const enable = useCallback(async (deviceId: string) => {
    setIsBusy(true);
    try {
      const next = await subscribePush(deviceId);
      if (mountedRef.current) setStatus(next);
    } finally {
      if (mountedRef.current) setIsBusy(false);
    }
  }, []);

  const disable = useCallback(async (deviceId: string) => {
    setIsBusy(true);
    try {
      const next = await unsubscribePush(deviceId);
      if (mountedRef.current) setStatus(next);
    } finally {
      if (mountedRef.current) setIsBusy(false);
    }
  }, []);

  return { status, isReady, isBusy, enable, disable };
}
