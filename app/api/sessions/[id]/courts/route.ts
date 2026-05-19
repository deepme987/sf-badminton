import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { addCourtBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { addCourt } from '@/lib/services';

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
    const body = await parseBody(req, addCourtBody);
    const session = await addCourt(getDb(), id, deviceId, body.capacity ?? 6);
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
