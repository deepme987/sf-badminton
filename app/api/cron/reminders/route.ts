import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { sessions, slots } from '@/lib/db/schema';
import { sendPush } from '@/lib/services/push';

/**
 * Hourly cron — sends a 4-hour reminder to everyone confirmed on a session
 * that starts in the next ~4 hours. Configured in vercel.json:
 *
 *   { "path": "/api/cron/reminders", "schedule": "0 * * * *" }
 *
 * Idempotency: `sessions.reminder_sent_at` is set on success so a later
 * tick won't double-send. The match window is intentionally wide (3.5 -> 4.5
 * hours from `now`) so an hourly cron will hit every upcoming session at
 * least once, even with cron skew.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We reject
 * any other caller — this endpoint must not be invokable from the public
 * internet without the secret.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORMAT_TIME = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Los_Angeles',
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'misconfigured', message: 'CRON_SECRET is not set' } },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'invalid cron secret' } },
      { status: 401 },
    );
  }

  const db = getDb();
  const now = new Date();
  const lower = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
  const upper = new Date(now.getTime() + 4.5 * 60 * 60 * 1000);

  const due = await db
    .select({
      id: sessions.id,
      startsAt: sessions.startsAt,
      venue: sessions.venue,
      venueCustom: sessions.venueCustom,
    })
    .from(sessions)
    .where(
      and(
        isNull(sessions.reminderSentAt),
        gte(sessions.startsAt, lower),
        lt(sessions.startsAt, upper),
      ),
    );

  const summary: Array<{
    sessionId: string;
    recipients: number;
    sent: number;
    failed: number;
    cleaned: number;
  }> = [];

  for (const session of due) {
    // Confirmed slot device-ids only. De-dupe (a host with a +1 shares the
    // same device id, so we'd otherwise notify them twice).
    const confirmed = await db
      .select({ deviceId: slots.deviceId })
      .from(slots)
      .where(and(eq(slots.sessionId, session.id), eq(slots.state, 'confirmed')));
    const recipients = Array.from(
      new Set(
        confirmed
          .map((r) => r.deviceId)
          .filter((d): d is string => typeof d === 'string' && d !== ''),
      ),
    );

    const venueLabel =
      session.venue === 'Other' ? (session.venueCustom ?? 'Other') : session.venue;
    const time = FORMAT_TIME.format(session.startsAt);

    const result = await sendPush(db, recipients, {
      title: 'In 4 hours',
      body: `${venueLabel} · ${time}`,
      url: `/sessions/${session.id}`,
      tag: `reminder-${session.id}`,
    });

    // Mark the session as reminded regardless of send outcome — if it failed
    // for everyone (e.g. nobody subscribed), we still don't want to retry
    // every hour for a session whose start time keeps drifting closer.
    await db
      .update(sessions)
      .set({ reminderSentAt: sql`now()` })
      .where(eq(sessions.id, session.id));

    summary.push({
      sessionId: session.id,
      recipients: recipients.length,
      sent: result.sent,
      failed: result.failed,
      cleaned: result.cleaned,
    });
  }

  return NextResponse.json({
    checked: due.length,
    summary,
    timestamp: now.toISOString(),
  });
}
