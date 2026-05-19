import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { enforceRateLimit, errorResponse, requireDeviceId } from '@/lib/api/http';
import { getDb } from '@/lib/db/client';
import { rotateCreatorCode } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sessions/[id]/creator-code/rotate
 *
 * Creator-only. Replaces the session's creatorCode with a freshly generated
 * one and emits a `rotate_creator_code` event (without the code value in the
 * payload). Returns the new session view plus the new code so the client can
 * flash it once for the user to save.
 */
export async function POST(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const { id } = await ctx.params;
    const { session, code } = await rotateCreatorCode(getDb(), id, deviceId);
    return Res.json({ session, code });
  } catch (err) {
    return errorResponse(err);
  }
}
