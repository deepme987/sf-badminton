import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse, requireDeviceId } from '@/lib/api/http';
import { getDb } from '@/lib/db/client';
import { dropSlot } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const { id } = await ctx.params;
    const session = await dropSlot(getDb(), id, deviceId);
    return NextResponse.json({ session });
  } catch (err) {
    return errorResponse(err);
  }
}
