'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SessionSummary } from '@/lib/services/types';
import { useIdentity } from '@/lib/client/use-identity';
import type { Identity } from '@/lib/client/identity';
import { shortDate, timeRange, venueNameFromSession } from '@/lib/client/format';
import { Button } from './button';
import { fetchSession } from '@/lib/client/api';
import { statusForSession, type SessionStatus } from '@/lib/client/session-view';
import { useToast } from './toast';
import { AppBar, IconButton } from './app-bar';
import { BottomBar } from './bottom-bar';
import { InstallButton } from './install-button';
import { IconPlus, IconUser } from './icons';
import { OnboardingCardSkeleton, UpcomingListSkeleton } from './skeleton';

interface HomePageClientProps {
  initialUpcoming: SessionSummary[];
  initialPast: SessionSummary[];
}

export function HomePageClient({ initialUpcoming, initialPast }: HomePageClientProps) {
  const { identity, isReady, setName } = useIdentity();

  if (!isReady) {
    // Render skeletons matching the two possible post-hydration states
    // (onboarding card OR populated home) so the page doesn't reflow when
    // identity resolves. We render BOTH the onboarding skeleton AND the
    // populated skeleton above each other isn't right — instead we render
    // a single neutral skeleton that occupies the populated layout, since
    // that's the common case after first visit. The onboarding card is
    // rare (only on a fresh device).
    return (
      <>
        <HomeAppBar showNewSession={false} showProfile={false} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          {initialUpcoming.length === 0 && initialPast.length === 0 ? (
            <OnboardingCardSkeleton />
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="t-page text-ink">Upcoming</h2>
                <span className="t-small text-ink-faint tnum">
                  {initialUpcoming.length}{' '}
                  {initialUpcoming.length === 1 ? 'session' : 'sessions'}
                </span>
              </div>
              <UpcomingListSkeleton rows={Math.max(1, Math.min(initialUpcoming.length, 3))} />
            </>
          )}
        </main>
      </>
    );
  }

  if (!identity) {
    // Pre-identity state: hide the profile icon entirely. Clicking it
    // before identity exists used to bounce the user right back here,
    // which read as broken navigation.
    return (
      <>
        <HomeAppBar showNewSession={false} showProfile={false} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <OnboardingCard onSubmit={(name) => setName(name)} />
        </main>
      </>
    );
  }

  return (
    <>
      <HomeAppBar showNewSession showProfile />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 has-bottom-bar">
        <PopulatedHome
          identity={identity}
          initialUpcoming={initialUpcoming}
          initialPast={initialPast}
        />
      </main>
      <BottomBar>
        <Link
          href="/sessions/new"
          className="btn-primary w-full h-12 t-section"
          style={{ borderRadius: 8 }}
        >
          New session
        </Link>
      </BottomBar>
    </>
  );
}

function HomeAppBar({
  showNewSession,
  showProfile,
}: {
  showNewSession: boolean;
  showProfile: boolean;
}) {
  return (
    <AppBar
      left={
        <div className="flex items-center px-3 sm:px-2">
          <span className="t-section text-ink whitespace-nowrap">SFB</span>
        </div>
      }
      right={
        <>
          {showNewSession ? (
            <span className="hidden md:inline-flex">
              <Link
                href="/sessions/new"
                className="btn-primary"
                aria-label="Create a new session"
              >
                <IconPlus className="h-4 w-4 -ml-0.5 mr-1" />
                New session
              </Link>
            </span>
          ) : null}
          {/* InstallButton replaces the old ThemeToggle slot — when the
            * browser supports PWA install it surfaces a button; otherwise
            * (and on iOS first-visit) it renders the hint card. */}
          <InstallButton />
          {showProfile ? (
            <IconButton href="/profile" aria-label="Profile and settings">
              <IconUser />
            </IconButton>
          ) : null}
        </>
      }
    />
  );
}

function OnboardingCard({ onSubmit }: { onSubmit: (name: string) => Identity }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Pick a name so people know who you are.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="pt-2 mx-auto max-w-md md:pt-12">
      <h1 className="t-page text-ink mb-3">Welcome.</h1>
      <p className="t-body text-ink-soft mb-6 leading-relaxed">
        This is a single source of truth for who&apos;s playing on Friday. Type your name to
        start.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="onboard-name" className="block t-label mb-1.5">
            Your name
          </label>
          <input
            id="onboard-name"
            type="text"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Megha"
            className="input-field"
          />
          {error ? <p className="t-small text-danger mt-1.5">{error}</p> : null}
        </div>
        <Button type="submit" fullWidth>
          Continue
        </Button>
        <p className="t-small text-ink-faint text-center">
          You can change this any time in your profile.
        </p>
      </form>
    </div>
  );
}

function PopulatedHome({
  identity,
  initialUpcoming,
  initialPast,
}: {
  identity: Identity;
  initialUpcoming: SessionSummary[];
  initialPast: SessionSummary[];
}) {
  const past = initialPast.slice(0, 5);
  const hasUpcoming = initialUpcoming.length > 0;

  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="t-page text-ink">Upcoming</h2>
        <span className="t-small text-ink-faint tnum">
          {initialUpcoming.length} {initialUpcoming.length === 1 ? 'session' : 'sessions'}
        </span>
      </div>

      {hasUpcoming ? (
        <div className="sheet mb-10">
          <div className="sheet-row-head sheet-row-upcoming">
            <div>When</div>
            <div>Venue</div>
            <div className="col-courts num-right">Courts</div>
            <div className="col-status">Status</div>
            <div className="num-right">Spots / Waiting</div>
          </div>
          {initialUpcoming.map((s) => (
            <UpcomingRow key={s.id} summary={s} deviceId={identity.deviceId} />
          ))}
        </div>
      ) : (
        <EmptyUpcoming />
      )}

      {past.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between mb-3 mt-10">
            <h2 className="t-label">Earlier</h2>
            <Link href="/history" className="text-link t-small">
              See all ›
            </Link>
          </div>

          <div className="sheet mb-8">
            <div className="sheet-row-head sheet-row-past">
              <div>When</div>
              <div>Venue</div>
              <div className="col-courts num-right">Courts</div>
              <div className="col-status">Status</div>
              <div className="num-right">Players</div>
              <div className="col-paid-md num-right">Paid / slot</div>
            </div>
            {past.map((s) => (
              <PastRow key={s.id} summary={s} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function EmptyUpcoming() {
  return (
    <div className="border border-dashed border-rule rounded-md py-12 text-center mb-10">
      <p className="t-body text-ink-soft">No upcoming sessions yet.</p>
      <p className="t-small text-ink-faint mt-1">
        Tap &ldquo;New session&rdquo; below, or open a link someone shared.
      </p>
    </div>
  );
}

function UpcomingRow({
  summary,
  deviceId,
}: {
  summary: SessionSummary;
  deviceId: string;
}) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchSession(summary.id)
      .then((view) => {
        if (cancelled) return;
        setStatus(statusForSession(view, deviceId));
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'not_voted' });
      });
    return () => {
      cancelled = true;
    };
  }, [summary.id, deviceId, toast]);

  const open = summary.totalCapacity - summary.confirmedCount;
  const isFull = open <= 0;

  return (
    <Link
      href={`/sessions/${encodeURIComponent(summary.id)}`}
      className="sheet-row sheet-row-upcoming"
    >
      <div className="min-w-0">
        <div className="t-body text-ink font-medium">{shortDate(summary.startsAt)}</div>
        <div className="t-small text-ink-soft tnum">
          {timeRange(summary.startsAt, summary.endsAt)}
        </div>
      </div>
      <div className="t-body text-ink-soft truncate">{venueNameFromSession(summary)}</div>
      <div className="col-courts t-body text-ink-soft num-right tnum">
        {/* totalCapacity / per-court capacity is approximated by inferring from
            summary; we don't have court count on the summary, so derive from
            capacity heuristic (4-6). Show as confirmed/total instead. */}
        {Math.max(1, Math.round(summary.totalCapacity / 6))}
      </div>
      <div className="col-status">
        {status ? (
          renderStatusPill(status, isFull)
        ) : (
          <span className={`pip ${isFull ? 'pip-full' : 'pip-open'} tnum`}>
            {summary.confirmedCount} / {summary.totalCapacity}{' '}
            {isFull ? 'full' : 'open'}
          </span>
        )}
      </div>
      <div className="num-right tnum">
        <span className="t-body text-ink">{open} open</span>
        <span className="t-small text-ink-faint"> · {summary.waitlistCount} waiting</span>
      </div>
    </Link>
  );
}

function PastRow({ summary }: { summary: SessionSummary }) {
  return (
    <Link
      href={`/sessions/${encodeURIComponent(summary.id)}`}
      className="sheet-row sheet-row-past"
    >
      <div className="min-w-0">
        <div className="t-body text-ink-soft font-medium">{shortDate(summary.startsAt)}</div>
        <div className="t-small text-ink-faint tnum">
          {timeRange(summary.startsAt, summary.endsAt)}
        </div>
      </div>
      <div className="t-body text-ink-soft truncate">{venueNameFromSession(summary)}</div>
      <div className="col-courts t-body text-ink-soft num-right tnum">
        {Math.max(1, Math.round(summary.totalCapacity / 6))}
      </div>
      <div className="col-status">
        <span className="pip pip-past">Settled</span>
      </div>
      <div className="num-right t-body text-ink-soft tnum">{summary.confirmedCount} played</div>
      <div className="col-paid-md num-right t-body text-ink-faint tnum">—</div>
    </Link>
  );
}

function renderStatusPill(status: SessionStatus, isFull: boolean): React.ReactNode {
  switch (status.kind) {
    case 'confirmed':
      return <span className="pip pip-open">You&apos;re in</span>;
    case 'waitlist':
      return (
        <span className="pip" style={{ color: 'var(--waitlist)' }}>
          Waitlist #{status.position}
        </span>
      );
    case 'lead_only':
      return <span className="pip pip-open">Lead</span>;
    case 'dropped':
      return <span className="pip pip-past">Dropped</span>;
    case 'not_voted':
    default:
      return (
        <span className={`pip ${isFull ? 'pip-full' : 'pip-open'} tnum`}>
          {isFull ? 'Full' : 'Open'}
        </span>
      );
  }
}
