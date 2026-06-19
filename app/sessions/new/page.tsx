'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KNOWN_VENUES, OTHER_VENUE, getVenueMaxCourts } from '@/lib/venues';
import { useIdentity } from '@/lib/client/use-identity';
import { createSession, addCourt, ApiError } from '@/lib/client/api';
import {
  DISPLAY_TZ_LABEL,
  nowPtParts,
  ptParts,
  ptToUnixMs,
  todayPtDateInput,
} from '@/lib/client/timezone';
import { Button } from '@/app/_components/button';
import { useToast } from '@/app/_components/toast';
import { AppBar, IconButton } from '@/app/_components/app-bar';
import { BottomBar } from '@/app/_components/bottom-bar';
import { IconArrowLeft } from '@/app/_components/icons';

type VenueChoice = 'Shuttl' | 'OneA' | 'Other';

const ALL_VENUES: VenueChoice[] = ['Shuttl', 'OneA', 'Other'];

/**
 * Default date for the picker: today in PT, bumped to tomorrow once it's
 * past 6pm PT (most evening games are already locked by then). Computed in
 * PT so a Tokyo creator scheduling a Bay Area session doesn't see "today"
 * shifted by a day.
 */
function todayDateInput(): string {
  const now = nowPtParts();
  if (now.hour >= 18) {
    // Bump by a day. Build a UTC anchor at the picked day and read the PT
    // date back so DST/month-rollovers are correct.
    const bumped = new Date(Date.UTC(now.year, now.month - 1, now.day + 1));
    const y = bumped.getUTCFullYear();
    const m = String(bumped.getUTCMonth() + 1).padStart(2, '0');
    const d = String(bumped.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return todayPtDateInput();
}

/**
 * Convert the form's Y-M-D + H:M into a Unix-ms instant, interpreting the
 * inputs as PT wall-clock values regardless of the picker's local zone.
 * Without this, a Tokyo creator picking "Friday 7pm" stored Thursday 3am PT.
 */
function ptInputToUnixMs(dateStr: string, timeStr: string): number {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const [hStr, miStr] = timeStr.split(':');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const mi = Number(miStr);
  if ([y, m, d, h, mi].some((n) => Number.isNaN(n))) return NaN;
  return ptToUnixMs(y, m, d, h, mi);
}

export default function NewSessionPage() {
  const router = useRouter();
  const toast = useToast();
  const { identity, isReady, setLastVenue } = useIdentity();

  const [date, setDate] = useState<string>(todayDateInput());
  const [start, setStart] = useState<string>('19:00');
  const [end, setEnd] = useState<string>('21:00');
  const [venue, setVenue] = useState<VenueChoice>('Shuttl');
  const [venueCustom, setVenueCustom] = useState<string>('');
  const [courtCount, setCourtCount] = useState<number>(1);
  const [capacity, setCapacity] = useState<number>(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (identity?.lastVenue) {
      const last = identity.lastVenue;
      if (ALL_VENUES.includes(last as VenueChoice)) {
        setVenue(last as VenueChoice);
      } else {
        setVenue('Other');
        setVenueCustom(last);
      }
    }
  }, [isReady, identity?.lastVenue]);

  const venueMaxCourts = useMemo(() => {
    if (venue === 'Other') return null;
    return getVenueMaxCourts(venue);
  }, [venue]);

  useEffect(() => {
    if (venueMaxCourts !== null && courtCount > venueMaxCourts) {
      setCourtCount(venueMaxCourts);
    }
  }, [venueMaxCourts, courtCount]);

  if (!isReady) {
    return <CenteredLoading />;
  }

  if (!identity) {
    return <NeedNameNotice />;
  }

  const validate = (): string | null => {
    const startMs = ptInputToUnixMs(date, start);
    const endMs = ptInputToUnixMs(date, end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return 'Pick a date and times.';
    }
    if (endMs <= startMs) {
      return 'End time has to be after start.';
    }
    if (startMs < Date.now() - 60_000) {
      return 'Pick a time in the future.';
    }
    if (venue === 'Other' && venueCustom.trim() === '') {
      return 'Type the venue name.';
    }
    if (capacity < 4 || capacity > 6) {
      return 'Court capacity must be 4 to 6.';
    }
    if (courtCount < 1 || courtCount > 4) {
      return 'Court count must be at least 1.';
    }
    if (venueMaxCourts !== null && courtCount > venueMaxCourts) {
      return `${venue} allows at most ${venueMaxCourts} court(s).`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const startsAt = ptInputToUnixMs(date, start);
      const endsAt = ptInputToUnixMs(date, end);
      const session = await createSession(
        {
          startsAt,
          endsAt,
          venue,
          venueCustom: venue === 'Other' ? venueCustom.trim() : null,
          initialCapacity: capacity,
          creatorDisplayName: identity.displayName,
        },
        identity.deviceId,
      );

      let courtsActuallyAdded = 1;
      for (let i = 1; i < courtCount; i++) {
        try {
          await addCourt(session.id, capacity, identity.deviceId);
          courtsActuallyAdded += 1;
        } catch {
          toast.show(
            `Created the session with ${courtsActuallyAdded} court${
              courtsActuallyAdded === 1 ? '' : 's'
            }. Add the rest from the session screen.`,
            'error',
          );
          break;
        }
      }

      setLastVenue(venue === 'Other' ? venueCustom.trim() : venue);

      router.push(`/sessions/${encodeURIComponent(session.id)}?firstView=1`);
    } catch (cause) {
      setSubmitting(false);
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    }
  };

  return (
    <>
      <AppBar
        left={
          <IconButton href="/" aria-label="Cancel and go back">
            <IconArrowLeft />
          </IconButton>
        }
        title="New session"
        right={
          <span className="hidden md:inline-flex">
            <Button type="submit" form="new-session-form" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create session'}
            </Button>
          </span>
        }
      />
      <main id="main" className="max-w-2xl mx-auto px-4 sm:px-6 py-6 has-bottom-bar">
        <form id="new-session-form" onSubmit={handleSubmit} className="space-y-8">
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="t-label">When</h2>
            <span className="t-small text-ink-faint">
              All times Pacific ({DISPLAY_TZ_LABEL})
            </span>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="ns-date" className="block t-label mb-1.5">
                Date
              </label>
              <input
                id="ns-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayPtDateInput()}
                className="input-field tnum sm:max-w-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div>
                <label htmlFor="ns-start" className="block t-label mb-1.5">
                  Starts
                </label>
                <input
                  id="ns-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="input-field tnum"
                />
              </div>
              <div>
                <label htmlFor="ns-end" className="block t-label mb-1.5">
                  Ends
                </label>
                <input
                  id="ns-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input-field tnum"
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="t-label mb-3">Where</h2>
          <label htmlFor="ns-venue" className="block t-label mb-1.5">
            Venue
          </label>
          <select
            id="ns-venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value as VenueChoice)}
            className="input-field sm:max-w-xs"
          >
            {KNOWN_VENUES.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name} · up to {v.maxCourts} court{v.maxCourts === 1 ? '' : 's'}
              </option>
            ))}
            <option value={OTHER_VENUE}>Other — specify below</option>
          </select>
          {venue === 'Other' ? (
            <input
              type="text"
              value={venueCustom}
              onChange={(e) => setVenueCustom(e.target.value)}
              placeholder="Venue name"
              className="input-field mt-2 sm:max-w-xs"
              aria-label="Custom venue name"
            />
          ) : null}
          <p className="t-small text-ink-faint mt-1.5">
            {venueMaxCourts === null
              ? 'Other — no preset cap on courts.'
              : 'Court limit is enforced from the venue.'}
          </p>
        </section>

        <section>
          <h2 className="t-label mb-3">Courts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <div>
              <label className="block t-label mb-1.5">Starting with</label>
              <Stepper
                value={courtCount}
                setValue={setCourtCount}
                min={1}
                max={venueMaxCourts ?? 8}
                suffix={courtCount === 1 ? 'court' : 'courts'}
              />
              {venueMaxCourts !== null ? (
                <p className="t-small text-ink-faint mt-1.5">
                  {venue} caps this at {venueMaxCourts} court{venueMaxCourts === 1 ? '' : 's'}.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block t-label mb-1.5">Each court holds</label>
              <Stepper
                value={capacity}
                setValue={setCapacity}
                min={4}
                max={6}
                suffix="people"
              />
              <p className="t-small text-ink-faint mt-1.5">Range 4 to 6.</p>
            </div>
          </div>
          <p className="t-small text-ink-faint mt-3">You can add more courts later.</p>
        </section>

        <p className="t-small text-ink-soft border border-rule rounded-md px-3 py-2 bg-zebra">
          You&apos;re not auto-added — tap &ldquo;I&apos;m in&rdquo; on the next screen if
          you&apos;re playing.
        </p>

        {error ? (
          <div className="t-small text-danger border border-rule rounded-md px-3 py-2 bg-zebra">
            {error}
          </div>
        ) : null}

        <div className="pt-4 border-t border-rule">
          <div className="t-small text-ink-soft tnum truncate">
            {summaryLine({ date, start, end, venue, venueCustom, courtCount, capacity })}
          </div>
        </div>
        </form>
      </main>
      <BottomBar>
        <button
          type="submit"
          form="new-session-form"
          disabled={submitting}
          className="btn-primary w-full h-12 t-section"
          style={{ borderRadius: 8 }}
        >
          {submitting ? 'Creating…' : 'Create session'}
        </button>
      </BottomBar>
    </>
  );
}

function Stepper({
  value,
  setValue,
  min,
  max,
  suffix,
}: {
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  const dec = () => setValue(Math.max(min, value - 1));
  const inc = () => setValue(Math.min(max, value + 1));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease"
        className="btn-ghost h-10 w-10 px-0"
      >
        −
      </button>
      <div className="h-10 flex-1 flex items-center justify-center rounded-md border border-rule bg-surface tnum t-body font-medium">
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase"
        className="btn-ghost h-10 w-10 px-0"
      >
        +
      </button>
      {suffix ? <span className="t-small text-ink-soft ml-1">{suffix}</span> : null}
    </div>
  );
}

function summaryLine(args: {
  date: string;
  start: string;
  end: string;
  venue: VenueChoice;
  venueCustom: string;
  courtCount: number;
  capacity: number;
}): string {
  const { date, start, end, venue, venueCustom, courtCount, capacity } = args;
  const startMs = ptInputToUnixMs(date, start);
  const endMs = ptInputToUnixMs(date, end);
  let when = '—';
  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    const dateStr = new Date(startMs).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
    const fmt = (h: number, m: number, isPm: boolean) => {
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = isPm ? 'pm' : 'am';
      return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
    };
    const s = ptParts(startMs);
    const e = ptParts(endMs);
    const timeStr = `${fmt(s.hour, s.minute, s.hour >= 12)}-${fmt(e.hour, e.minute, e.hour >= 12)}`;
    when = `${dateStr} · ${timeStr} PT`;
  }
  const venueStr = venue === 'Other' ? venueCustom.trim() || 'Other' : venue;
  const courtsStr = `${courtCount} court${courtCount === 1 ? '' : 's'} of ${capacity}`;
  return `${when} · ${venueStr} · ${courtsStr}`;
}

function CenteredLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center text-ink-soft t-small">
      Loading…
    </main>
  );
}

function NeedNameNotice() {
  return (
    <main className="mx-auto max-w-md px-5 py-12 text-center">
      <p className="t-body text-ink-soft mb-4">Set your name first.</p>
      <Link href="/" className="btn-primary">
        Go to start
      </Link>
    </main>
  );
}
