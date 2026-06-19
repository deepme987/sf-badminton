/**
 * Render-time formatters. All pure, side-effect-free.
 *
 * Timestamps on the wire are unix-ms numbers — see lib/services/types.ts.
 * Convert to Date only here.
 *
 * Everything user-facing is rendered in Pacific Time regardless of the
 * viewer's local zone. This is a Bay Area badminton group and we had a
 * Tokyo viewer thinking a Friday session was on Saturday — the calendar
 * day flipped because the formatters were defaulting to the local zone.
 * See lib/client/timezone.ts.
 */

import type { EventView, SessionSummary, SessionView } from '@/lib/services/types';
import { DISPLAY_TZ, ptParts } from './timezone';

const CIRCLED_DIGITS = [
  '①',
  '②',
  '③',
  '④',
  '⑤',
  '⑥',
  '⑦',
  '⑧',
  '⑨',
  '⑩',
] as const;

export function circledPosition(n: number): string {
  if (n >= 1 && n <= 10) return CIRCLED_DIGITS[n - 1]!;
  return String(n);
}

export function waitlistPosition(n: number): string {
  return `W${n}`;
}

/** "Fri, May 22" or "Today" / "Tomorrow" if within 36h. Compared in PT. */
export function shortDate(ms: number, now: number = Date.now()): string {
  const session = ptParts(ms);
  const today = ptParts(now);
  // Build "midnight in PT" dates as UTC anchors so the subtraction is a
  // straight day-count delta unaffected by the viewer's local zone.
  const startOfToday = Date.UTC(today.year, today.month - 1, today.day);
  const startOfSession = Date.UTC(session.year, session.month - 1, session.day);
  const dayDiff = Math.round((startOfSession - startOfToday) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: DISPLAY_TZ,
  });
}

/** "Friday, May 22" (long form, used as the session-detail h1). PT. */
export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: DISPLAY_TZ,
  });
}

/** "7-9pm PT" — kebab between numbers, lowercase am/pm at end only. */
export function timeRange(startMs: number, endMs: number): string {
  const s = ptParts(startMs);
  const e = ptParts(endMs);
  const sIsPm = s.hour >= 12;
  const eIsPm = e.hour >= 12;

  const fmtClock = (h: number, m: number): string => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (m === 0) return `${h12}`;
    return `${h12}:${m.toString().padStart(2, '0')}`;
  };

  const sAmPm = sIsPm ? 'pm' : 'am';
  const eAmPm = eIsPm ? 'pm' : 'am';
  const startStr = sIsPm === eIsPm ? fmtClock(s.hour, s.minute) : `${fmtClock(s.hour, s.minute)}${sAmPm}`;
  const endStr = `${fmtClock(e.hour, e.minute)}${eAmPm}`;
  return `${startStr}-${endStr} PT`;
}

/** "7:00 — 9:00pm PT" — long form for the session detail header. */
export function longTimeRange(startMs: number, endMs: number): string {
  const s = ptParts(startMs);
  const e = ptParts(endMs);
  const sIsPm = s.hour >= 12;
  const eIsPm = e.hour >= 12;

  const fmtClock = (h: number, m: number): string => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')}`;
  };
  const sAmPm = sIsPm ? 'pm' : 'am';
  const eAmPm = eIsPm ? 'pm' : 'am';
  const startStr = sIsPm === eIsPm ? fmtClock(s.hour, s.minute) : `${fmtClock(s.hour, s.minute)}${sAmPm}`;
  const endStr = `${fmtClock(e.hour, e.minute)}${eAmPm}`;
  return `${startStr} — ${endStr} PT`;
}

export function venueName(
  venue: string,
  venueCustom: string | null,
): string {
  if (venue === 'Other') return (venueCustom ?? '').trim() || 'Other';
  return venue;
}

export function venueNameFromSession(
  s: Pick<SessionView, 'venue' | 'venueCustom'> | Pick<SessionSummary, 'venue' | 'venueCustom'>,
): string {
  return venueName(s.venue, s.venueCustom);
}

/** "2m ago", "5h ago", "Fri 6:12pm". */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  const secs = Math.round(diff / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TZ,
  });
}

/** Format cents as USD ($86.40). Negative or NaN renders as "$0". */
export function formatDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents) || cents < 0) {
    return '$0';
  }
  return `$${(cents / 100).toFixed(2)}`;
}

interface FormatEventOpts {
  /** Map of slot id -> display name, used to look up names referenced by event payloads. */
  nameByDeviceId?: Map<string, string>;
}

/**
 * Best-effort human readable line for an event. Falls back to "{action}" when
 * we can't infer anything. Recent-events strip uses this.
 */
export function formatEvent(
  event: EventView,
  _opts: FormatEventOpts = {},
): string {
  // Event payloads are loosely typed (jsonb). Probe defensively.
  const payload = event.payload ?? {};
  const action = event.action;

  if (action === 'create_session') {
    const by = typeof payload.creatorDisplayName === 'string' ? payload.creatorDisplayName : null;
    return by ? `Session created by ${by}.` : 'Session created.';
  }
  if (action === 'add_court') {
    const pos = typeof payload.position === 'number' ? payload.position : null;
    return pos !== null ? `Court ${pos} added.` : 'Court added.';
  }
  if (action === 'set_court_number') {
    const bookedAs = typeof payload.bookedAs === 'string' ? payload.bookedAs : null;
    return bookedAs ? `Set court to "${bookedAs}".` : 'Cleared court number.';
  }
  if (action === 'set_court_capacity') {
    const cap = typeof payload.capacity === 'number' ? payload.capacity : null;
    return cap !== null ? `Set court capacity to ${cap}.` : 'Updated court capacity.';
  }
  if (action === 'join') {
    const name = typeof payload.displayName === 'string' ? payload.displayName : 'Someone';
    const state = typeof payload.state === 'string' ? payload.state : null;
    const pos = typeof payload.position === 'number' ? payload.position : null;
    if (state === 'confirmed' && pos !== null) {
      return `${name} joined. Position ${circledPosition(pos)}.`;
    }
    if (state === 'waitlist' && pos !== null) {
      return `${name} joined the waitlist (${waitlistPosition(pos)}).`;
    }
    return `${name} joined.`;
  }
  if (action === 'add_plus_one') {
    const name = typeof payload.displayName === 'string' ? payload.displayName : 'a guest';
    const state = typeof payload.state === 'string' ? payload.state : null;
    const pos = typeof payload.position === 'number' ? payload.position : null;
    if (state === 'confirmed' && pos !== null) {
      return `+1 ${name} added. Position ${circledPosition(pos)}.`;
    }
    if (state === 'waitlist' && pos !== null) {
      return `+1 ${name} added to waitlist (${waitlistPosition(pos)}).`;
    }
    return `+1 ${name} added.`;
  }
  if (action === 'drop') {
    const actor = typeof payload.actor === 'string' ? payload.actor : 'self';
    return actor === 'creator' ? 'A slot was dropped by the lead.' : 'A slot was dropped.';
  }
  if (action === 'auto_promote') {
    return 'Auto-promoted from waitlist.';
  }
  if (action === 'set_cost') {
    const cents = typeof payload.totalCostCents === 'number' ? payload.totalCostCents : null;
    return cents === null ? 'Cleared cost.' : `Total cost set to ${formatDollars(cents)}.`;
  }
  if (action === 'update_session') return 'Session details updated.';

  return action;
}
