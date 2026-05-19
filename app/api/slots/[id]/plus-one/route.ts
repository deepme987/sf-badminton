import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { addPlusOneBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { ServiceError } from '@/lib/errors';
import { addPlusOne } from '@/lib/services';
import { eq } from 'drizzle-orm';
import { slots as slotsTable } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const { id } = await ctx.params;
    const body = await parseBody(req, addPlusOneBody);

    const db = getDb();
    const ownerRows = await db.select().from(slotsTable).where(eq(slotsTable.id, id));
    const owner = ownerRows[0];
    if (!owner) throw new ServiceError('not_found', 'slot not found');

    const slot = await addPlusOne(db, {
      sessionId: owner.sessionId,
      ownerSlotId: id,
      requesterDeviceId: deviceId,
      plusOneName: body.plusOneName,
    });
    return NextResponse.json({ slot }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
