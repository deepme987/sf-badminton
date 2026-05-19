import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { joinSessionBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { joinSession } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const { id } = await ctx.params;
    const body = await parseBody(req, joinSessionBody);
    const slot = await joinSession(getDb(), {
      sessionId: id,
      deviceId,
      displayName: body.displayName,
    });
    return NextResponse.json({ slot }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
