import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { patchCourtBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { setCourtCapacity, setCourtNumber } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const { id } = await ctx.params;
    const body = await parseBody(req, patchCourtBody);

    const db = getDb();
    let lastSession = null;
    if (body.capacity !== undefined) {
      lastSession = await setCourtCapacity(db, id, deviceId, body.capacity);
    }
    if (body.bookedAs !== undefined) {
      lastSession = await setCourtNumber(db, id, deviceId, body.bookedAs);
    }
    return NextResponse.json({ session: lastSession });
  } catch (err) {
    return errorResponse(err);
  }
}
