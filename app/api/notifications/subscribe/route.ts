/**
 * POST /api/notifications/subscribe — upsert this device's push subscription.
 *
 * Idempotent: if the device re-subscribes (e.g. after clearing site data or
 * re-installing the PWA) the row is replaced with the fresh endpoint + keys
 * via Drizzle's `onConflictDoUpdate`. We key by `device_id`, which lets a
 * single browser/device transparently roll its push endpoint without leaking
 * a second row.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { pushSubscribeBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { pushSubscriptions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const body = await parseBody(req, pushSubscribeBody);

    const now = new Date();
    await getDb()
      .insert(pushSubscriptions)
      .values({
        deviceId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.deviceId,
        set: {
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: body.userAgent ?? null,
          updatedAt: now,
        },
      });

    return Res.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
