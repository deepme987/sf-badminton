'use client';

import Link from 'next/link';
import type { SessionSummary } from '@/lib/services/types';
import { shortDate, timeRange, venueNameFromSession } from '@/lib/client/format';

interface HistoryListProps {
  sessions: SessionSummary[];
}

export function HistoryList({ sessions }: HistoryListProps) {
  if (sessions.length === 0) {
    return (
      <div className="border border-dashed border-rule rounded-md py-12 text-center">
        <p className="t-body text-ink-soft">Nothing&apos;s wrapped up yet.</p>
        <p className="t-small text-ink-faint mt-1">
          Once a session ends, it&apos;ll show up here with the roster and the split.
        </p>
      </div>
    );
  }

  // Group by "Month YYYY".
  const grouped = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const d = new Date(s.startsAt);
    const key = d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }

  return (
    <div className="space-y-10">
      {Array.from(grouped.entries()).map(([month, items]) => (
        <section key={month}>
          <div className="section-bar">
            <h2 className="t-label">{month}</h2>
            <span className="t-small text-ink-faint tnum">
              {items.length} {items.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>
          <div className="sheet">
            <div className="sheet-row-head sheet-row-past">
              <div>When</div>
              <div>Venue</div>
              <div className="col-courts num-right">Courts</div>
              <div className="col-status">Status</div>
              <div className="num-right">Players</div>
              <div className="col-paid-md num-right">Paid / slot</div>
            </div>
            {items.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${encodeURIComponent(s.id)}`}
                className="sheet-row sheet-row-past"
              >
                <div className="min-w-0">
                  <div className="t-body text-ink-soft font-medium">{shortDate(s.startsAt)}</div>
                  <div className="t-small text-ink-faint tnum">
                    {timeRange(s.startsAt, s.endsAt)}
                  </div>
                </div>
                <div className="t-body text-ink-soft truncate">{venueNameFromSession(s)}</div>
                <div className="col-courts t-body text-ink-soft num-right tnum">
                  {Math.max(1, Math.round(s.totalCapacity / 6))}
                </div>
                <div className="col-status">
                  <span className="pip pip-past">Settled</span>
                </div>
                <div className="num-right t-body text-ink-soft tnum">{s.confirmedCount} played</div>
                <div className="col-paid-md num-right t-body text-ink-faint tnum">—</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
