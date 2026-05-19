import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { NextResponse as Res, after } from 'next/server';
import { enforceRateLimit, errorResponse, parseBody, requireDeviceId } from '@/lib/api/http';
import { createSessionBody } from '@/lib/api/schemas';
import { getDb } from '@/lib/db/client';
import { createSession } from '@/lib/services';
import { getAllSubscribers, sendPush } from '@/lib/services/push';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/Los_Angeles',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Los_Angeles',
});

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

    // Fan out a "new session" push to everyone subscribed (minus the creator
    // — they don't need a notification for their own session). `after()` runs
    // post-response so the create call doesn't block on push delivery.
    //
    // `after()` is only available inside a Next request context (route
    // handlers + middleware). In unit tests we call POST directly with a
    // mocked Request, so `after()` throws — guard it so the response path
    // stays clean.
    try {
      after(async () => {
        try {
          const db = getDb();
          const allSubscribers = await getAllSubscribers(db);
          const recipients = allSubscribers.filter((id) => id !== deviceId);
          if (recipients.length === 0) return;

          const venueLabel =
            view.venue === 'Other' ? (view.venueCustom ?? 'Other') : view.venue;
          const startDate = new Date(view.startsAt);
          const body = `${venueLabel} · ${DAY.format(startDate)} ${TIME.format(startDate)}`;
          await sendPush(db, recipients, {
            title: 'New SFB session',
            body,
            url: `/sessions/${view.id}`,
            tag: `new-session-${view.id}`,
          });
        } catch (cause) {
          // eslint-disable-next-line no-console
          console.warn('[push] new-session fanout failed', cause);
        }
      });
    } catch {
      // No request context — happens in unit tests. The response below still
      // succeeds; we just skip the broadcast.
    }

    return Res.json(view, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
