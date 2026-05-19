/**
 * Web Push send path.
 *
 * Server-only utility that fans a `PushPayload` out to a list of device_ids.
 * Lazy-configures `web-push` on first call so the route handler can import this
 * at module scope without crashing in environments where the VAPID env vars
 * aren't set yet (e.g. some local dev / vitest paths that never actually call
 * `sendPush`).
 *
 * The cleanup path here is load-bearing: when a push endpoint returns 404 or
 * 410, the subscription is permanently dead (uninstalled PWA, expired endpoint,
 * cleared browser data). We delete the row immediately so the next fanout
 * doesn't waste bandwidth on it. Other errors are counted but do NOT throw —
 * a single bad subscription can't take down the whole broadcast.
 */
import webpush, { type WebPushError } from 'web-push';
import { inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { pushSubscriptions } from '../db/schema';

let configured = false;

function configure(): void {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      'web-push not configured: set VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY',
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Click target URL relative to origin. */
  url: string;
  /**
   * Optional notification tag — the SW uses this to coalesce: a newer
   * notification with the same `tag` replaces an older one in the OS tray
   * rather than stacking.
   */
  tag?: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  cleaned: number;
}

/**
 * Send `payload` to every push subscription owned by any device id in
 * `deviceIds`. Returns counts; never throws.
 */
export async function sendPush(
  db: DbClient,
  deviceIds: string[],
  payload: PushPayload,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, cleaned: 0 };
  if (deviceIds.length === 0) return result;

  try {
    configure();
  } catch (err) {
    // No VAPID config — log once and bail. Callers shouldn't crash the caller
    // flow (session creation, cron) because notifications aren't set up.
    // eslint-disable-next-line no-console
    console.warn('[push] not configured, skipping fanout', err);
    return result;
  }

  // De-dupe device ids before the lookup so a host with multiple +1s doesn't
  // multiply the SELECT.
  const unique = Array.from(new Set(deviceIds.filter((d) => typeof d === 'string' && d !== '')));
  if (unique.length === 0) return result;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.deviceId, unique));

  if (subs.length === 0) return result;

  const json = JSON.stringify(payload);
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
        );
        result.sent += 1;
      } catch (cause) {
        const status = (cause as WebPushError | undefined)?.statusCode;
        if (status === 404 || status === 410) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          result.failed += 1;
          // eslint-disable-next-line no-console
          console.warn('[push] send failed', {
            endpoint: sub.endpoint,
            status,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, expiredEndpoints));
    result.cleaned = expiredEndpoints.length;
  }

  return result;
}

/**
 * Returns every device id that has an active push subscription. Used by the
 * new-session fanout — anyone subscribed gets pinged once a new session lands.
 */
export async function getAllSubscribers(db: DbClient): Promise<string[]> {
  const rows = await db
    .select({ deviceId: pushSubscriptions.deviceId })
    .from(pushSubscriptions);
  return rows.map((r) => r.deviceId);
}
