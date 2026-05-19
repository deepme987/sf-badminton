/**
 * GET /api/notifications/status — does this device have a push subscription?
 *
 * Used by the Profile toggle on mount so we can render the correct on/off
 * state even when the local SW state and the server are out of sync (e.g.
 * the user cleared site data on a different browser).
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { eq } from 'drizzle-orm';
import { errorResponse, requireDeviceId } from '@/lib/api/http';
import { getDb } from '@/lib/db/client';
import { pushSubscriptions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const rows = await getDb()
      .select({ deviceId: pushSubscriptions.deviceId })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.deviceId, deviceId))
      .limit(1);
    return Res.json({ subscribed: rows.length > 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
