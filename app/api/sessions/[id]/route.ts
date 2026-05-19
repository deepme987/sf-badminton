import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { updateSessionBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { deleteSession, getSession, setTotalCost, updateSession } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await ctx.params;
    const view = await getSession(getDb(), id);
    return Res.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const { id } = await ctx.params;
    const body = await parseBody(req, updateSessionBody);

    const db = getDb();
    const { totalCostCents, ...rest } = body;

    let view = await getSession(db, id);
    if (Object.values(rest).some((v) => v !== undefined)) {
      view = await updateSession(db, id, deviceId, {
        startsAt: rest.startsAt,
        endsAt: rest.endsAt,
        venue: rest.venue,
        venueCustom: rest.venueCustom ?? undefined,
      });
    }
    if (totalCostCents !== undefined) {
      view = await setTotalCost(db, id, deviceId, totalCostCents);
    }
    return Res.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const { id } = await ctx.params;
    await deleteSession(getDb(), id, deviceId);
    return Res.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
