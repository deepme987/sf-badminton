'use client';

/**
 * Service-worker → client deep-link bridge.
 *
 * When a user taps a push notification while the PWA is already open, the SW
 * focuses the existing tab and posts `{ type: 'sfb:navigate', url }`. We
 * receive that here and route via Next's App Router so the navigation feels
 * native (no full reload, scroll restoration works, transitions intact).
 *
 * Why this matters: iOS Safari ignores `Client.navigate()` from a service
 * worker. Without this bridge the user would land in the open tab (probably
 * the home screen) instead of the session the notification pointed at.
 *
 * Component renders nothing; mounted once in the root layout.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SwNavMessage {
  type: 'sfb:navigate';
  url: string;
}

function isSwNavMessage(x: unknown): x is SwNavMessage {
  if (!x || typeof x !== 'object') return false;
  const m = x as { type?: unknown; url?: unknown };
  return m.type === 'sfb:navigate' && typeof m.url === 'string' && m.url.startsWith('/');
}

export function SwNavListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (!isSwNavMessage(event.data)) return;
      router.push(event.data.url);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
