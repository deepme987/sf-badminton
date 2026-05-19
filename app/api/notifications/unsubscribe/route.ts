/**
 * DELETE /api/notifications/unsubscribe — drop this device's push subscription.
 *
 * No-op when no row exists. The client also calls `subscription.unsubscribe()`
 * on the local PushManager before hitting this endpoint so the OS forgets
 * about us too.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { eq } from 'drizzle-orm';
import { enforceRateLimit, errorResponse, requireDeviceId } from '@/lib/api/http';
import { getDb } from '@/lib/db/client';
import { pushSubscriptions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;

    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.deviceId, deviceId));
    return Res.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
