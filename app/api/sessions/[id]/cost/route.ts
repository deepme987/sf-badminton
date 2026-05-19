import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { setCostBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { setTotalCost } from '@/lib/services';

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
    const body = await parseBody(req, setCostBody);
    const view = await setTotalCost(getDb(), id, deviceId, body.totalCostCents);
    return Res.json(view);
  } catch (err) {
    return errorResponse(err);
  }
}
