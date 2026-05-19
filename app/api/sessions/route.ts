import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { createSessionBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { createSession } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const deviceId = requireDeviceId(req);
    const limited = enforceRateLimit(deviceId);
    if (limited) return limited;
    const body = await parseBody(req, createSessionBody);
    const view = await createSession(getDb(), {
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      venue: body.venue,
      venueCustom: body.venueCustom ?? null,
      creatorDeviceId: deviceId,
      initialCapacity: body.initialCapacity,
    });
    return Res.json(view, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
