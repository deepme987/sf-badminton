import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api/http';
import { getDb } from '@/lib/db/client';
import { listUpcomingSessions } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const sessions = await listUpcomingSessions(getDb());
    return NextResponse.json(sessions);
  } catch (err) {
    return errorResponse(err);
  }
}
