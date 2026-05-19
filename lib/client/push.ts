/**
 * Client-side push subscription helpers.
 *
 * The browser PushManager API hands us a `PushSubscription` shaped object;
 * we serialize it and POST to /api/notifications/subscribe so the server can
 * call `webpush.sendNotification` against it later.
 *
 * The `applicationServerKey` needs to be a `Uint8Array` decoded from the
 * VAPID public key's URL-safe base64. The browser rejects raw strings here
 * — `urlBase64ToUint8Array` is the classic web-push helper for that.
 */

export type PushStatus =
  | 'unsupported' // no SW or no PushManager (e.g. iOS not added to home screen)
  | 'denied' // OS/browser permission denied
  | 'not-subscribed' // SW + permission available, just not subscribed
  | 'subscribed';

const SUBSCRIBE_URL = '/api/notifications/subscribe';
const UNSUBSCRIBE_URL = '/api/notifications/unsubscribe';
const STATUS_URL = '/api/notifications/status';

/**
 * Decode a URL-safe base64 string (the VAPID public key format) into a
 * `Uint8Array`. The PushManager spec requires this exact representation; a
 * raw string here triggers an `InvalidAccessError`. Padding to a multiple
 * of 4 is required because `atob` rejects unpadded strings in Safari.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (typeof Notification === 'undefined') return false;
  return true;
}

/** True when the app is running as an installed PWA (display-mode: standalone). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS exposes a non-standard `standalone` boolean on the navigator.
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  if (iosStandalone) return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(display-mode: standalone)').matches;
  }
  return false;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ identifies as Mac; check for touchscreen as a tiebreaker.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  );
}

/**
 * True when the user is on iOS Safari without the PWA installed — that's the
 * one configuration where `Notification.requestPermission()` returns
 * 'default' immediately without prompting. We surface a different copy in
 * that case so the toggle doesn't appear broken.
 */
export function needsIosInstallPrompt(): boolean {
  if (!isIos()) return false;
  if (isStandalone()) return false;
  if (typeof Notification === 'undefined') return true;
  return Notification.permission === 'default';
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await readyServiceWorker();
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'not-subscribed';
}

function serializeSubscription(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} | null {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

async function postSubscription(
  deviceId: string,
  sub: PushSubscription,
): Promise<boolean> {
  const serialized = serializeSubscription(sub);
  if (!serialized) return false;
  const res = await fetch(SUBSCRIBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({
      endpoint: serialized.endpoint,
      keys: serialized.keys,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    }),
  });
  return res.ok;
}

export async function subscribePush(deviceId: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  const reg = await readyServiceWorker();
  if (!reg) return 'unsupported';

  // Requesting permission while already 'granted' is a cheap no-op and resolves
  // synchronously with 'granted'. Calling it while 'denied' returns 'denied'
  // without prompting. Safe to call unconditionally.
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'not-subscribed';
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      // eslint-disable-next-line no-console
      console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
      return 'not-subscribed';
    }
    try {
      // Cast to BufferSource — TS5 widens Uint8Array.buffer to ArrayBufferLike
      // (could be SharedArrayBuffer) but pushManager.subscribe wants a strict
      // ArrayBuffer. Our helper always returns an ArrayBuffer-backed view.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      });
    } catch (cause) {
      // eslint-disable-next-line no-console
      console.warn('[push] subscribe failed', cause);
      // The OS treats some failures (e.g. user dismissing the permission
      // sheet) as "not granted yet". Re-check.
      return Notification.permission === 'denied' ? 'denied' : 'not-subscribed';
    }
  }

  const ok = await postSubscription(deviceId, sub);
  if (!ok) {
    // Server refused our subscription — roll the local one back so we don't
    // sit in a half-subscribed state (OS knows, server doesn't).
    try {
      await sub.unsubscribe();
    } catch {
      // best-effort
    }
    return 'not-subscribed';
  }
  return 'subscribed';
}

export async function unsubscribePush(deviceId: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  const reg = await readyServiceWorker();
  if (!reg) return 'unsupported';

  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await sub.unsubscribe();
    } catch {
      // ignore — even if the local unsubscribe fails, the server-side delete
      // is enough to stop new notifications.
    }
  }
  await fetch(UNSUBSCRIBE_URL, {
    method: 'DELETE',
    headers: { 'X-Device-Id': deviceId },
  }).catch(() => {
    // best-effort — the next subscribe round-trip will reconcile.
  });
  return 'not-subscribed';
}

/**
 * Convenience reconciliation: ask the server whether we're subscribed and
 * compare to local SW state. If they disagree (server says yes, SW says no),
 * the SW is the source of truth — the user reset the OS/browser permission
 * since we last subscribed. We surface the SW view.
 */
export async function syncPushStatus(deviceId: string): Promise<PushStatus> {
  const local = await getPushStatus();
  if (local !== 'subscribed') {
    // The server might still have a stale row — if so, clean it up so future
    // status checks don't lie. Best-effort.
    try {
      const res = await fetch(STATUS_URL, {
        headers: { 'X-Device-Id': deviceId },
      });
      if (res.ok) {
        const body = (await res.json()) as { subscribed?: boolean };
        if (body.subscribed) {
          await fetch(UNSUBSCRIBE_URL, {
            method: 'DELETE',
            headers: { 'X-Device-Id': deviceId },
          }).catch(() => {});
        }
      }
    } catch {
      // best-effort
    }
  }
  return local;
}
