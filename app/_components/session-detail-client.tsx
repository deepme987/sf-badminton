'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CourtView, SessionView, SlotView } from '@/lib/services/types';
import {
  addCourt,
  addPlusOne,
  ApiError,
  deleteSession,
  dropSlot,
  fetchSession,
  joinSession,
  patchCourt,
  setSessionCost,
} from '@/lib/client/api';
import {
  canDropSlot,
  deriveSession,
  hasOpenCourtSpot,
  slotNameMap,
} from '@/lib/client/session-view';
import { useIdentity } from '@/lib/client/use-identity';
import { writeIdentity } from '@/lib/client/identity';
import { copyText, shareUrl } from '@/lib/client/clipboard';
import {
  circledPosition,
  formatDollars,
  formatEvent,
  longDate,
  longTimeRange,
  relativeTime,
  venueNameFromSession,
  waitlistPosition,
} from '@/lib/client/format';
import { Button } from './button';
import { Modal } from './modal';
import { useToast } from './toast';
import { EmptySlotRow, SlotRow } from './slot-row';
import { AppBar, IconButton } from './app-bar';
import { BottomBar } from './bottom-bar';
import { IconArrowLeft, IconMore, IconShare } from './icons';
import { TopProgressBar } from './skeleton';

interface SessionDetailClientProps {
  initialSession: SessionView;
  /**
   * No longer used — kept for backward compatibility with the server page
   * which passes `?firstView=1` after session creation. The post-create
   * creator-code banner has been removed in favor of a single "Share
   * session" affordance; the creator code itself is now reachable via the
   * Edit Session kebab menu.
   */
  firstView?: boolean;
}

type ModalKind =
  | { kind: 'none' }
  | { kind: 'plus-one'; ownerSlot: SlotView }
  | { kind: 'drop-self'; slot: SlotView }
  | { kind: 'drop-other'; slot: SlotView }
  | { kind: 'add-court' }
  | { kind: 'set-cost' }
  | { kind: 'delete' }
  | { kind: 'set-court-number'; court: CourtView }
  | { kind: 'name-prompt' };

const POLL_INTERVAL_MS = 8000;

export function SessionDetailClient({
  initialSession,
  firstView: _firstView,
}: SessionDetailClientProps) {
  void _firstView; // intentionally unused — see prop docstring.
  const [session, setSession] = useState<SessionView>(initialSession);
  const [modal, setModal] = useState<ModalKind>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  /**
   * Server-side deletion flag. The polling loop trips this on a 404, and the
   * render path swaps in a sticky "This session was deleted." banner instead
   * of unmounting / redirecting. We want the user to see WHY the page went
   * blank, not just bounce them home.
   */
  const [serverDeleted, setServerDeleted] = useState(false);
  // `isRefetching` drives the thin top progress bar during background polls.
  // It's NOT set on optimistic mutation paths — only on the polling tick + on
  // the manual `refresh()` helper. That way the bar reads as "we're catching
  // up with the server" rather than "your action is in flight" (which the
  // button's "Joining…" label already covers).
  const [isRefetching, setIsRefetching] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const { identity, isReady } = useIdentity();
  const seenPromotionsRef = useRef<Set<string>>(new Set());

  const isPast = session.endsAt < Date.now();
  const derived = useMemo(
    () => deriveSession(session, identity?.deviceId ?? null),
    [session, identity?.deviceId],
  );
  const nameById = useMemo(() => slotNameMap(session), [session]);
  const venueText = venueNameFromSession(session);

  useEffect(() => {
    if (!isReady) return;
    if (!identity) {
      setModal({ kind: 'name-prompt' });
    } else if (modal.kind === 'name-prompt') {
      setModal({ kind: 'none' });
    }
  }, [isReady, identity, modal.kind]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      setIsRefetching(true);
      try {
        const fresh = await fetchSession(session.id);
        if (!cancelled) {
          maybeFirePromotionToasts(fresh, identity?.deviceId, toast, seenPromotionsRef);
          // Defensive cleanup: a successful poll always replaces local state
          // wholesale. If an optimistic slot is still hanging around, the
          // server response is the source of truth — drop the optimistic
          // entry rather than letting both coexist (which can mangle names
          // on the next render).
          setSession(fresh);
        }
      } catch (cause) {
        // 404 means the session was deleted server-side (creator hit
        // Delete, or a test harness removed it). Stop polling immediately
        // and surface a sticky banner instead of redirecting — the user
        // should see WHY the page went stale.
        if (cause instanceof ApiError && cause.code === 'not_found') {
          if (!cancelled) {
            setServerDeleted(true);
            stop();
          }
          return;
        }
        // Anything else (network blip, 500) — silently let the next tick
        // try again. The user shouldn't see a toast on every transient
        // hiccup during a background poll.
      } finally {
        if (!cancelled) setIsRefetching(false);
      }
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, POLL_INTERVAL_MS);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        start();
        void tick();
      } else {
        stop();
      }
    };

    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session.id, identity?.deviceId, toast]);

  const refresh = useCallback(async () => {
    setIsRefetching(true);
    try {
      const fresh = await fetchSession(session.id);
      maybeFirePromotionToasts(fresh, identity?.deviceId, toast, seenPromotionsRef);
      setSession(fresh);
    } catch (cause) {
      // Same handling as the polling tick — 404 means the session was
      // server-side deleted. Other errors are silent (the caller's own
      // try/catch handles user-visible toasts on mutations).
      if (cause instanceof ApiError && cause.code === 'not_found') {
        setServerDeleted(true);
      }
    } finally {
      setIsRefetching(false);
    }
  }, [session.id, identity?.deviceId, toast]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (!identity) {
      setModal({ kind: 'name-prompt' });
      return;
    }
    if (busy) return;

    const snapshot = session;
    const optimisticSlot = buildOptimisticSlot(session, identity);
    setSession(applyOptimisticSlot(session, optimisticSlot));
    setBusy(true);

    try {
      const slot = await joinSession(session.id, identity.displayName, identity.deviceId);
      await refresh();
      if (slot.state === 'confirmed') {
        toast.show(
          `You're in. ${courtLabelFor(session, slot.courtId)}, position ${circledPosition(
            slot.position,
          )}.`,
          'success',
        );
      } else {
        toast.show(`You're on the waitlist (${waitlistPosition(slot.position)}).`, 'info');
      }
    } catch (cause) {
      setSession(snapshot);
      handleError(cause, toast);
    } finally {
      setBusy(false);
    }
  }, [busy, identity, refresh, session, toast]);

  const handleDrop = useCallback(
    async (slot: SlotView) => {
      if (!identity || busy) return;
      const snapshot = session;
      setBusy(true);
      setDroppingId(slot.id);

      setSession(applyOptimisticDrop(session, slot.id));

      try {
        const fresh = await dropSlot(slot.id, identity.deviceId);
        maybeFirePromotionToasts(fresh, identity.deviceId, toast, seenPromotionsRef);
        setSession(fresh);
        toast.show('Dropped.', 'success');
        setModal({ kind: 'none' });
      } catch (cause) {
        setSession(snapshot);
        handleError(cause, toast);
      } finally {
        setBusy(false);
        setDroppingId(null);
      }
    },
    [busy, identity, session, toast],
  );

  const handleAddPlusOne = useCallback(
    async (ownerSlot: SlotView, name: string) => {
      if (!identity || busy) return;
      setBusy(true);
      try {
        const slot = await addPlusOne(ownerSlot.id, name, identity.deviceId);
        toast.show(
          slot.state === 'confirmed'
            ? `+1 ${slot.displayName} added.`
            : `+1 ${slot.displayName} on the waitlist.`,
          'success',
        );
        await refresh();
        setModal({ kind: 'none' });
      } catch (cause) {
        handleError(cause, toast);
      } finally {
        setBusy(false);
      }
    },
    [busy, identity, refresh, toast],
  );

  const handleAddCourt = useCallback(
    async (capacity: number) => {
      if (!identity || busy) return;
      setBusy(true);
      try {
        const fresh = await addCourt(session.id, capacity, identity.deviceId);
        setSession(fresh);
        toast.show('Court added.', 'success');
        setModal({ kind: 'none' });
      } catch (cause) {
        handleError(cause, toast);
      } finally {
        setBusy(false);
      }
    },
    [busy, identity, session.id, toast],
  );

  const handleSetCost = useCallback(
    async (dollarsStr: string) => {
      if (!identity || busy) return;
      const parsed = parseDollarsToCents(dollarsStr);
      if (parsed === null) {
        toast.show('Enter a valid amount.', 'error');
        return;
      }
      setBusy(true);
      try {
        const fresh = await setSessionCost(session.id, parsed, identity.deviceId);
        setSession(fresh);
        toast.show('Total cost set.', 'success');
        setModal({ kind: 'none' });
      } catch (cause) {
        handleError(cause, toast);
      } finally {
        setBusy(false);
      }
    },
    [busy, identity, session.id, toast],
  );

  const handleSetCourtNumber = useCallback(
    async (court: CourtView, bookedAs: string) => {
      if (!identity || busy) return;
      setBusy(true);
      try {
        const fresh = await patchCourt(
          court.id,
          { bookedAs: bookedAs.trim() === '' ? null : bookedAs.trim() },
          identity.deviceId,
        );
        setSession(fresh);
        toast.show('Court number saved.', 'success');
        setModal({ kind: 'none' });
      } catch (cause) {
        handleError(cause, toast);
      } finally {
        setBusy(false);
      }
    },
    [busy, identity, toast],
  );

  const handleDelete = useCallback(async () => {
    if (!identity || busy) return;
    setBusy(true);
    try {
      await deleteSession(session.id, identity.deviceId);
      toast.show('Session deleted.', 'success');
      router.push('/');
    } catch (cause) {
      handleError(cause, toast);
      setBusy(false);
    }
  }, [busy, identity, router, session.id, toast]);

  const handleCopyCreatorCode = useCallback(async () => {
    const ok = await copyText(session.creatorCode);
    toast.show(
      ok ? 'Creator code copied.' : 'Could not copy. Try selecting it manually.',
      ok ? 'success' : 'error',
    );
  }, [session.creatorCode, toast]);

  const handleCopyRoster = useCallback(async () => {
    const text = buildRosterText(session, venueText);
    const ok = await copyText(text);
    toast.show(ok ? 'Roster copied to clipboard.' : 'Could not copy.', ok ? 'success' : 'error');
  }, [session, toast, venueText]);

  const handleShareLink = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/sessions/${session.id}`;
    const result = await shareUrl({ title: 'Vibe Badminton session', url });
    if (result === 'shared') return; // OS share sheet handled feedback.
    if (result === 'copied') {
      toast.show('Link copied.', 'success');
    } else {
      toast.show('Copy failed.', 'error');
    }
  }, [session.id, toast]);

  const handleCopyCostSplit = useCallback(async () => {
    const cents = session.totalCostCents;
    const totalSlots =
      session.courts.reduce((sum, c) => sum + c.slots.length, 0) + session.waitlist.length;
    if (cents === null || totalSlots === 0) return;
    const perSlot = formatDollars(Math.round(cents / totalSlots));
    const text = `${formatDollars(cents)} ÷ ${totalSlots} slots = ${perSlot} per slot`;
    const ok = await copyText(text);
    toast.show(ok ? 'Cost split copied.' : 'Could not copy.', ok ? 'success' : 'error');
  }, [session, toast]);

  // ─── Render ──────────────────────────────────────────────────────────────
  // We don't return early on !isReady anymore — the server already hydrated us
  // with `initialSession`, so the page is paintable. Identity-gated UI (CTAs,
  // creator banner) already guards on `identity` directly, and `!identity`
  // triggers the NamePromptModal via the effect above.

  const canDoMutations = !!identity;
  const yourPrimary = derived.yourPrimarySlot;
  const courtsHaveRoom = hasOpenCourtSpot(session);
  const confirmedCount = derived.confirmedCount;
  const totalCapacity = derived.totalCapacity;
  const waitlistCount = session.waitlist.length;
  const creatorName = creatorDisplayName(session);

  const showBottomBar = !isPast && canDoMutations;
  const appBarTitle = (
    <div className="min-w-0">
      <div className="t-section text-ink truncate tnum">
        {shortAppBarTitle(session.startsAt)}
        <span className="hidden sm:inline"> · {venueText}</span>
      </div>
      <div className="t-small text-ink-faint truncate sm:hidden">{venueText}</div>
    </div>
  );

  return (
    <>
      <TopProgressBar visible={isRefetching && !busy} />
      <AppBar
        left={
          <IconButton href="/" aria-label="Back to sessions">
            <IconArrowLeft />
          </IconButton>
        }
        title={appBarTitle}
        right={
          <>
            {!isPast && canDoMutations ? (
              <>
                {/* Desktop-only inline primary CTA */}
                {renderTopCTA({
                  derived,
                  courtsHaveRoom,
                  yourPrimary,
                  busy,
                  onJoinClick: handleJoin,
                  onPlusOneClick: () => {
                    if (yourPrimary) setModal({ kind: 'plus-one', ownerSlot: yourPrimary });
                  },
                })}
                <IconButton aria-label="Share session" onClick={handleShareLink}>
                  <IconShare />
                </IconButton>
              </>
            ) : null}
            {derived.isCreator ? (
              <CreatorKebab
                onDelete={() => setModal({ kind: 'delete' })}
                creatorCode={session.creatorCode}
                onCopyCreatorCode={handleCopyCreatorCode}
              />
            ) : null}
          </>
        }
      />
      <main
        className={`max-w-4xl mx-auto px-4 sm:px-6 py-6 ${showBottomBar ? 'has-bottom-bar' : ''}`}
      >
      {/* Server-deleted banner — sticky top-of-content notice that surfaces
        * when the polling tick (or post-mutation refetch) hits a 404. We
        * stop polling at the same time so we don't keep hammering the
        * endpoint; the existing local state is left intact so the user
        * still sees the last-known roster as context. */}
      {serverDeleted ? <ServerDeletedBanner /> : null}

      {/* Title block — two-line layout on every viewport. Line 1 is the
        * date+time (t-page, ink). Line 2 (t-section) gives the venue its own
        * weight — ink + font-medium so "Shuttl" reads clearly at a glance —
        * with "Hosted by X" demoted to ink-soft so it reads as metadata. */}
      <div className="mb-2">
        <h1 className="t-page tnum text-ink">
          {longDate(session.startsAt)} · {longTimeRange(session.startsAt, session.endsAt)}
        </h1>
        <p className="t-section mt-1">
          <span className="text-ink font-medium">{venueText}</span>
          {creatorName ? (
            <span className="text-ink-soft font-normal"> · Hosted by {creatorName}</span>
          ) : null}
        </p>
      </div>

      {/* Metadata strip */}
      <div className="meta-strip mb-6 tnum">
        <span>
          <span className="text-ink">{confirmedCount}</span>{' '}
          <span className="text-ink-soft">
            confirmed{totalCapacity ? ` / ${totalCapacity}` : ''}
          </span>
        </span>
        <span className="sep">·</span>
        <span>
          <span className="text-ink">{waitlistCount}</span>{' '}
          <span className="text-ink-soft">waiting</span>
        </span>
        <span className="sep">·</span>
        <span className="text-ink-soft">
          {session.totalCostCents === null
            ? 'No cost set yet'
            : `Total ${formatDollars(session.totalCostCents)}`}
        </span>
        <span className="sep">·</span>
        <button type="button" onClick={handleCopyRoster} className="text-link">
          Copy roster
        </button>
        <span className="sep hidden sm:inline">·</span>
        <button
          type="button"
          onClick={handleShareLink}
          className="text-link hidden sm:inline"
        >
          Share link
        </button>
      </div>

      {/* Your status, if any */}
      {yourPrimary ? (
        <div className="mb-6 flex items-center gap-2 t-small">
          {yourPrimary.state === 'confirmed' ? (
            <>
              <span className="tag tag-host">You&apos;re in</span>
              <span className="text-ink-soft tnum">
                {courtLabelFor(session, yourPrimary.courtId)},{' '}
                position {circledPosition(positionWithinCourt(session, yourPrimary))}
              </span>
            </>
          ) : (
            <>
              <span className="tag tag-waitlist">
                Waitlist #{positionWithinWaitlist(session, yourPrimary)}
              </span>
            </>
          )}
        </div>
      ) : null}

      {isPast ? (
        <div className="t-small text-ink-faint mb-6">This session is over.</div>
      ) : null}

      {/* Courts */}
      <div className="space-y-8">
        {session.courts.map((court) => (
          <CourtSection
            key={court.id}
            court={court}
            session={session}
            identityId={identity?.deviceId ?? null}
            isCreator={derived.isCreator}
            nameById={nameById}
            onDropSelf={(slot) => setModal({ kind: 'drop-self', slot })}
            onDropOther={(slot) => setModal({ kind: 'drop-other', slot })}
            onSetCourtNumber={() => setModal({ kind: 'set-court-number', court })}
            droppingId={droppingId}
          />
        ))}
      </div>

      {/* Waitlist */}
      {session.waitlist.length > 0 ? (
        <WaitlistSection
          session={session}
          identityId={identity?.deviceId ?? null}
          nameById={nameById}
          onDropSelf={(slot) => setModal({ kind: 'drop-self', slot })}
          onDropOther={(slot) => setModal({ kind: 'drop-other', slot })}
          droppingId={droppingId}
        />
      ) : null}

      {derived.isCreator && !isPast ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setModal({ kind: 'add-court' })}
            className="block w-full text-center text-ink-soft hover:text-ink t-small h-10 leading-[40px] rounded-md border border-dashed border-rule hover:border-ink-faint transition-colors"
          >
            + Add court
          </button>
        </div>
      ) : null}

      {/* Cost split */}
      <CostSplitSection
        session={session}
        isCreator={derived.isCreator}
        onSetCost={() => setModal({ kind: 'set-cost' })}
        onCopySplit={handleCopyCostSplit}
      />

      {/* Activity */}
      <ActivitySection session={session} />
      </main>

      {showBottomBar ? (
        <BottomBar>
          {renderBottomBarCTA({
            derived,
            courtsHaveRoom,
            yourPrimary,
            busy,
            onJoinClick: handleJoin,
            onPlusOneClick: () => {
              if (yourPrimary) setModal({ kind: 'plus-one', ownerSlot: yourPrimary });
            },
            onDropSelfClick: () => {
              if (yourPrimary) setModal({ kind: 'drop-self', slot: yourPrimary });
            },
          })}
        </BottomBar>
      ) : null}

      {/* Modals -------------------------------------------------------- */}
      <PlusOneModal
        open={modal.kind === 'plus-one'}
        onClose={() => setModal({ kind: 'none' })}
        onSubmit={(name) => {
          if (modal.kind === 'plus-one') void handleAddPlusOne(modal.ownerSlot, name);
        }}
        busy={busy}
      />

      <Modal
        open={modal.kind === 'drop-self'}
        onClose={() => setModal({ kind: 'none' })}
        title={
          modal.kind === 'drop-self' && modal.slot.state === 'waitlist'
            ? 'Drop your spot on the waitlist?'
            : 'Drop your spot?'
        }
      >
        {modal.kind === 'drop-self' && modal.slot.state === 'confirmed' ? (
          <p className="t-body text-ink-soft mb-5">
            Heads up — if you rejoin later, you&apos;ll be at the back of the line.
          </p>
        ) : (
          <div className="mb-5" />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={() => setModal({ kind: 'none' })}>
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={busy}
            onClick={() => {
              if (modal.kind === 'drop-self') void handleDrop(modal.slot);
            }}
          >
            {busy ? 'Dropping…' : 'Drop'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={modal.kind === 'drop-other'}
        onClose={() => setModal({ kind: 'none' })}
        title={
          modal.kind === 'drop-other' ? `Drop ${modal.slot.displayName}?` : 'Drop slot?'
        }
      >
        <p className="t-body text-ink-soft mb-5">
          The waitlist will auto-promote into the empty spot, if anyone&apos;s waiting.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={() => setModal({ kind: 'none' })}>
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={busy}
            onClick={() => {
              if (modal.kind === 'drop-other') void handleDrop(modal.slot);
            }}
          >
            {busy
              ? 'Dropping…'
              : `Drop ${modal.kind === 'drop-other' ? modal.slot.displayName : ''}`}
          </Button>
        </div>
      </Modal>

      <AddCourtModal
        open={modal.kind === 'add-court'}
        onClose={() => setModal({ kind: 'none' })}
        onSubmit={(cap) => void handleAddCourt(cap)}
        nextLabel={`Court ${session.courts.length + 1}`}
        busy={busy}
      />

      <SetCostModal
        open={modal.kind === 'set-cost'}
        onClose={() => setModal({ kind: 'none' })}
        initialCents={session.totalCostCents}
        onSubmit={(s) => void handleSetCost(s)}
        busy={busy}
      />

      <SetCourtNumberModal
        open={modal.kind === 'set-court-number'}
        onClose={() => setModal({ kind: 'none' })}
        court={modal.kind === 'set-court-number' ? modal.court : null}
        onSubmit={(value) => {
          if (modal.kind === 'set-court-number')
            void handleSetCourtNumber(modal.court, value);
        }}
        busy={busy}
      />

      <Modal
        open={modal.kind === 'delete'}
        onClose={() => setModal({ kind: 'none' })}
        title="Delete this session?"
      >
        <p className="t-body text-ink-soft mb-5">
          This can&apos;t be undone. Everyone who joined will see &ldquo;session deleted.&rdquo;
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" fullWidth onClick={() => setModal({ kind: 'none' })}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth onClick={handleDelete} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>

      <NamePromptModal
        open={modal.kind === 'name-prompt'}
        onClose={() => setModal({ kind: 'none' })}
      />
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function creatorDisplayName(session: SessionView): string | null {
  for (const c of session.courts) {
    const owned = c.slots.find(
      (s) => s.deviceId === session.creatorDeviceId && !s.isPlusOne,
    );
    if (owned) return owned.displayName;
  }
  const wl = session.waitlist.find(
    (s) => s.deviceId === session.creatorDeviceId && !s.isPlusOne,
  );
  return wl?.displayName ?? null;
}

function buildOptimisticSlot(
  session: SessionView,
  identity: { deviceId: string; displayName: string },
): SlotView {
  const courtWithRoom = session.courts.find((c) => c.slots.length < c.capacity);
  const now = Date.now();
  const optimisticId = `__optimistic__${now}`;
  if (courtWithRoom) {
    return {
      id: optimisticId,
      sessionId: session.id,
      courtId: courtWithRoom.id,
      deviceId: identity.deviceId,
      displayName: identity.displayName,
      isPlusOne: false,
      plusOneOf: null,
      state: 'confirmed',
      position: courtWithRoom.slots.length + 1,
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    id: optimisticId,
    sessionId: session.id,
    courtId: null,
    deviceId: identity.deviceId,
    displayName: identity.displayName,
    isPlusOne: false,
    plusOneOf: null,
    state: 'waitlist',
    position: session.waitlist.length + 1,
    createdAt: now,
    updatedAt: now,
  };
}

function applyOptimisticSlot(session: SessionView, slot: SlotView): SessionView {
  if (slot.state === 'confirmed' && slot.courtId) {
    const courts = session.courts.map((c) =>
      c.id === slot.courtId ? { ...c, slots: [...c.slots, slot] } : c,
    );
    return { ...session, courts };
  }
  return { ...session, waitlist: [...session.waitlist, slot] };
}

function applyOptimisticDrop(session: SessionView, slotId: string): SessionView {
  return {
    ...session,
    courts: session.courts.map((c) => ({
      ...c,
      slots: c.slots.filter((s) => s.id !== slotId),
    })),
    waitlist: session.waitlist.filter((s) => s.id !== slotId),
  };
}

function maybeFirePromotionToasts(
  next: SessionView,
  deviceId: string | null | undefined,
  toast: { show: (s: string, tone?: 'success' | 'error' | 'info') => void },
  seenRef: { current: Set<string> },
) {
  if (!deviceId) return;
  for (const e of next.recentEvents) {
    if (e.action !== 'drop') continue;
    if (seenRef.current.has(e.id)) continue;
    const payload = e.payload ?? {};
    const promotedSlotId =
      typeof payload.promotedSlotId === 'string' ? payload.promotedSlotId : null;
    if (!promotedSlotId) continue;

    let promotedSlot: SlotView | null = null;
    for (const c of next.courts) {
      const m = c.slots.find((s) => s.id === promotedSlotId);
      if (m) {
        promotedSlot = m;
        break;
      }
    }
    seenRef.current.add(e.id);
    if (!promotedSlot) continue;
    if (promotedSlot.deviceId === deviceId) {
      toast.show(
        `You're in. ${courtLabelFor(next, promotedSlot.courtId)}, position ${circledPosition(
          positionWithinCourt(next, promotedSlot),
        )}.`,
        'info',
      );
    } else {
      toast.show(`${promotedSlot.displayName} was promoted from the waitlist.`, 'info');
    }
  }
}

function handleError(
  cause: unknown,
  toast: { show: (s: string, tone?: 'success' | 'error' | 'info') => void },
) {
  if (cause instanceof ApiError) {
    if (cause.code === 'unauthorized') {
      toast.show('Only the lead can do that.', 'error');
    } else {
      toast.show(cause.message, 'error');
    }
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    toast.show("Looks like you're offline. We'll retry when you're back.", 'error');
    return;
  }
  toast.show("That didn't go through. Try once more.", 'error');
}

function parseDollarsToCents(s: string): number | null {
  const cleaned = s.trim().replace(/^\$/, '');
  if (!/^[\d]+(\.[\d]{1,2})?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function courtLabelFor(session: SessionView, courtId: string | null): string {
  if (!courtId) return 'Waitlist';
  const c = session.courts.find((x) => x.id === courtId);
  return c?.label ?? 'Court';
}

function positionWithinCourt(session: SessionView, slot: SlotView): number {
  const court = session.courts.find((c) => c.id === slot.courtId);
  if (!court) return slot.position;
  const idx = court.slots.findIndex((s) => s.id === slot.id);
  return idx >= 0 ? idx + 1 : slot.position;
}

function positionWithinWaitlist(session: SessionView, slot: SlotView): number {
  const idx = session.waitlist.findIndex((s) => s.id === slot.id);
  return idx >= 0 ? idx + 1 : slot.position;
}

// Compact app-bar title — short date for mobile, full venue appended on sm+.
function shortAppBarTitle(startsAt: number): string {
  return new Date(startsAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Top-right CTA rendering — desktop only. Mobile uses BottomBar.
function renderTopCTA(args: {
  derived: ReturnType<typeof deriveSession>;
  courtsHaveRoom: boolean;
  yourPrimary: SlotView | null;
  busy: boolean;
  onJoinClick: () => void;
  onPlusOneClick: () => void;
}): React.ReactNode {
  const { derived, courtsHaveRoom, yourPrimary, busy, onJoinClick, onPlusOneClick } = args;

  if (yourPrimary) {
    // The slot id is optimistic until the server reconciles. Disable +1 so
    // the API doesn't get called with a non-UUID slot id (which 500s).
    const isOptimistic = yourPrimary.id.startsWith('__optimistic__');
    return (
      <span className="hidden md:inline-flex">
        <button
          type="button"
          onClick={onPlusOneClick}
          disabled={busy || isOptimistic}
          className="btn-ghost"
        >
          + Add a +1
        </button>
      </span>
    );
  }
  if (derived.hasDropped) {
    return (
      <span className="hidden md:inline-flex">
        <button type="button" onClick={onJoinClick} disabled={busy} className="btn-primary">
          {busy ? 'Rejoining…' : 'Rejoin'}
        </button>
      </span>
    );
  }
  return (
    <span className="hidden md:inline-flex">
      <button type="button" onClick={onJoinClick} disabled={busy} className="btn-primary">
        {busy
          ? 'Joining…'
          : courtsHaveRoom
            ? "I'm in"
            : `Join waitlist (#${derived.totalActiveSlots + 1})`}
      </button>
    </span>
  );
}

// Bottom-bar primary CTA — mobile only. State-aware: join, +1+drop, or rejoin.
function renderBottomBarCTA(args: {
  derived: ReturnType<typeof deriveSession>;
  courtsHaveRoom: boolean;
  yourPrimary: SlotView | null;
  busy: boolean;
  onJoinClick: () => void;
  onPlusOneClick: () => void;
  onDropSelfClick: () => void;
}): React.ReactNode {
  const {
    derived,
    courtsHaveRoom,
    yourPrimary,
    busy,
    onJoinClick,
    onPlusOneClick,
    onDropSelfClick,
  } = args;

  // Joined: side-by-side "+1" and "Drop". +1 takes more visual weight as the
  // common follow-up action; Drop is intentionally narrower and styled as
  // destructive-secondary so it's clearly the exit lane.
  if (yourPrimary) {
    // Slot id is `__optimistic__<ts>` until the server reconciles — disable
    // the +1 (which would hit /api/slots/<id>/plus-one with a non-UUID).
    const isOptimistic = yourPrimary.id.startsWith('__optimistic__');
    return (
      <>
        <button
          type="button"
          onClick={onPlusOneClick}
          disabled={busy || isOptimistic}
          className="btn-ghost flex-1 h-12 t-section"
          style={{ borderRadius: 8 }}
        >
          + Add a +1
        </button>
        <button
          type="button"
          onClick={onDropSelfClick}
          disabled={busy || isOptimistic}
          className="btn-danger h-12 px-4 t-section"
          style={{ borderRadius: 8 }}
        >
          Drop
        </button>
      </>
    );
  }
  if (derived.hasDropped) {
    return (
      <button
        type="button"
        onClick={onJoinClick}
        disabled={busy}
        className="btn-primary w-full h-12 t-section"
        style={{ borderRadius: 8 }}
      >
        {busy ? 'Rejoining…' : 'Rejoin'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoinClick}
      disabled={busy}
      className="btn-primary w-full h-12 t-section"
      style={{ borderRadius: 8 }}
    >
      {busy
        ? 'Joining…'
        : courtsHaveRoom
          ? "I'm in"
          : `Join waitlist (#${derived.totalActiveSlots + 1})`}
    </button>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function CourtSection({
  court,
  session,
  identityId,
  isCreator,
  nameById,
  onDropSelf,
  onDropOther,
  onSetCourtNumber,
  droppingId,
}: {
  court: CourtView;
  session: SessionView;
  identityId: string | null;
  isCreator: boolean;
  nameById: Map<string, string>;
  onDropSelf: (s: SlotView) => void;
  onDropOther: (s: SlotView) => void;
  onSetCourtNumber: () => void;
  droppingId: string | null;
}) {
  const emptyCount = Math.max(0, court.capacity - court.slots.length);
  const filled = court.slots.length;
  const cap = court.capacity;
  const isFull = filled >= cap;

  return (
    <section>
      <div className="section-bar">
        <h2 className="t-label">
          {court.label}{' '}
          <span className="text-ink-faint">
            ·{' '}
            {court.bookedAs ? `Booked as ${court.bookedAs}` : isFull ? 'Booked' : 'Open'}
          </span>
          {isCreator ? (
            <button
              type="button"
              onClick={onSetCourtNumber}
              className="text-link t-small ml-2 normal-case tracking-normal"
            >
              {court.bookedAs ? 'Edit' : 'Set #'}
            </button>
          ) : null}
        </h2>
        <span className="t-small text-ink-soft tnum">
          {filled} / {cap} {isFull ? 'full' : 'open'}
        </span>
      </div>

      <div className="sheet">
        <div className="sheet-row-head sheet-row-roster">
          <div className="num-right">#</div>
          <div>Name</div>
          <div>Tag</div>
          <div className="col-joined num-right">Joined</div>
        </div>
        {court.slots.map((slot, idx) => {
          const auth = canDropSlot(slot, session, identityId);
          const isYou = !!identityId && slot.deviceId === identityId && !slot.isPlusOne;
          const isYourPlusOne =
            !!identityId && slot.deviceId === identityId && slot.isPlusOne;
          const isHost = slot.deviceId === session.creatorDeviceId && !slot.isPlusOne;
          const plusOneHostName =
            slot.isPlusOne && slot.plusOneOf ? nameById.get(slot.plusOneOf) : undefined;
          return (
            <SlotRow
              key={slot.id}
              slot={slot}
              position={idx + 1}
              isWaitlist={false}
              isYou={isYou || isYourPlusOne}
              isHost={isHost}
              plusOneHostName={plusOneHostName}
              canDrop={auth.canDrop}
              onDrop={auth.isSelf ? onDropSelf : onDropOther}
              isDropping={droppingId === slot.id}
            />
          );
        })}
        {Array.from({ length: emptyCount }, (_, i) => (
          <EmptySlotRow key={`empty-${i}`} position={court.slots.length + i + 1} />
        ))}
      </div>
    </section>
  );
}

function WaitlistSection({
  session,
  identityId,
  nameById,
  onDropSelf,
  onDropOther,
  droppingId,
}: {
  session: SessionView;
  identityId: string | null;
  nameById: Map<string, string>;
  onDropSelf: (s: SlotView) => void;
  onDropOther: (s: SlotView) => void;
  droppingId: string | null;
}) {
  return (
    <section className="mt-8">
      <div className="section-bar">
        <h2 className="t-label">Waitlist</h2>
        <span className="t-small text-ink-soft tnum">
          {session.waitlist.length} waiting
        </span>
      </div>

      <div className="sheet">
        <div className="sheet-row-head sheet-row-roster">
          <div className="num-right">#</div>
          <div>Name</div>
          <div>Tag</div>
          <div className="col-joined num-right">Joined</div>
        </div>
        {session.waitlist.map((slot, idx) => {
          const auth = canDropSlot(slot, session, identityId);
          const isYou = !!identityId && slot.deviceId === identityId && !slot.isPlusOne;
          const isYourPlusOne =
            !!identityId && slot.deviceId === identityId && slot.isPlusOne;
          const isHost = slot.deviceId === session.creatorDeviceId && !slot.isPlusOne;
          const plusOneHostName =
            slot.isPlusOne && slot.plusOneOf ? nameById.get(slot.plusOneOf) : undefined;
          return (
            <SlotRow
              key={slot.id}
              slot={slot}
              position={idx + 1}
              isWaitlist
              isYou={isYou || isYourPlusOne}
              isHost={isHost}
              plusOneHostName={plusOneHostName}
              canDrop={auth.canDrop}
              onDrop={auth.isSelf ? onDropSelf : onDropOther}
              isDropping={droppingId === slot.id}
            />
          );
        })}
      </div>
    </section>
  );
}

function CostSplitSection({
  session,
  isCreator,
  onSetCost,
  onCopySplit,
}: {
  session: SessionView;
  isCreator: boolean;
  onSetCost: () => void;
  onCopySplit: () => void;
}) {
  const cents = session.totalCostCents;
  const totalSlots =
    session.courts.reduce((sum, c) => sum + c.slots.length, 0) + session.waitlist.length;
  const perSlotCents = cents !== null && totalSlots > 0 ? Math.round(cents / totalSlots) : 0;
  const hasSplit = cents !== null && totalSlots > 0;

  return (
    <section className="mt-10">
      <div className="section-bar">
        <h2 className="t-label">Cost split</h2>
        {isCreator ? (
          <button type="button" onClick={onSetCost} className="text-link t-small">
            {cents === null ? 'Set total' : 'Edit'}
          </button>
        ) : null}
      </div>

      {cents === null ? (
        <div className="border border-rule rounded-md bg-surface px-4 py-3 t-small text-ink-soft">
          {isCreator
            ? 'Set the total once you know what you paid.'
            : 'Set after play. The lead will fill it in.'}
        </div>
      ) : !hasSplit ? (
        <div className="border border-rule rounded-md bg-surface px-4 py-3 t-small text-ink-soft">
          Total: <span className="tnum text-ink">{formatDollars(cents)}</span> — will split
          once people join.
        </div>
      ) : (
        <div className="border border-rule rounded-md bg-surface px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="t-page tnum text-ink">{formatDollars(perSlotCents)}</span>
            <span className="t-small text-ink-soft">per slot</span>
          </div>
          <div className="mt-1 t-small text-ink-soft">
            <span className="tnum">{formatDollars(cents)}</span>
            <span className="mx-1.5 text-ink-faint">÷</span>
            <span className="tnum">{totalSlots}</span> slots
          </div>
          <div className="mt-3 flex items-center justify-end gap-3">
            <button type="button" onClick={onCopySplit} className="text-link t-small">
              Copy split
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ActivitySection({ session }: { session: SessionView }) {
  const events = session.recentEvents.slice(0, 6);
  if (events.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="section-bar">
        <h2 className="t-label">Activity</h2>
      </div>
      <div className="sheet">
        <div className="sheet-row-head sheet-row-audit">
          <div>When</div>
          <div>Who</div>
          <div className="col-what">What</div>
        </div>
        {events.map((e) => {
          const payload = e.payload ?? {};
          const who =
            typeof payload.displayName === 'string' && payload.displayName
              ? (payload.displayName as string)
              : '—';
          return (
            <div key={e.id} className="sheet-row sheet-row-audit">
              <div className="t-small text-ink-faint tnum">{relativeTime(e.createdAt)}</div>
              <div className="t-body text-ink truncate">{who}</div>
              <div className="col-what t-body text-ink-soft truncate">{formatEvent(e)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CreatorKebab({
  onDelete,
  creatorCode,
  onCopyCreatorCode,
}: {
  onDelete: () => void;
  creatorCode: string;
  onCopyCreatorCode: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = () => setOpen(false);
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);
  useEffect(() => {
    if (!open) setRevealed(false);
  }, [open]);
  return (
    <div className="relative">
      <IconButton
        aria-label="Session menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IconMore />
      </IconButton>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 bg-surface border border-rule rounded-md shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {revealed ? (
            <div className="px-4 py-3">
              <div className="t-label mb-1.5">Creator code</div>
              <div className="font-mono t-body text-ink break-all mb-2">{creatorCode}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void onCopyCreatorCode();
                  }}
                  className="text-link t-small"
                >
                  Copy
                </button>
                <span className="t-small text-ink-faint">
                  Use this to reclaim creator powers from another device.
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setRevealed(true)}
              className="block w-full text-left px-4 py-2.5 t-body text-ink hover:bg-hover"
            >
              Reveal creator code
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full text-left px-4 py-2.5 t-body text-danger hover:bg-hover border-t border-rule"
          >
            Delete session
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sticky banner shown when polling discovers the session has been deleted
 * server-side. Polling stops at the same time we mount this.
 */
function ServerDeletedBanner() {
  return (
    <div
      role="status"
      className="mb-6 border border-rule rounded-md bg-zebra px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="t-body text-ink">
        <span className="font-medium">This session was deleted.</span>{' '}
        <span className="text-ink-soft">The lead removed it. The roster below is stale.</span>
      </div>
      <Link href="/" className="btn-ghost shrink-0">
        Home
      </Link>
    </div>
  );
}

function PlusOneModal({
  open,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a +1">
      <label htmlFor="po-name" className="block t-label mb-1.5">
        Guest&apos;s name
      </label>
      <input
        id="po-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Roshan"
        autoFocus
        className="input-field"
      />
      <p className="t-small text-ink-faint mt-2 mb-5">Takes one spot. Splits one share.</p>
      <Button
        fullWidth
        disabled={busy || name.trim() === ''}
        onClick={() => onSubmit(name.trim())}
      >
        {busy ? 'Adding…' : name.trim() === '' ? 'Add +1' : `Add ${name.trim()}`}
      </Button>
    </Modal>
  );
}

function AddCourtModal({
  open,
  onClose,
  onSubmit,
  nextLabel,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (cap: number) => void;
  nextLabel: string;
  busy: boolean;
}) {
  const [cap, setCap] = useState(6);
  useEffect(() => {
    if (open) setCap(6);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a court">
      <p className="t-body text-ink-soft mb-4">
        This will start with {cap} spots open. The top of the waitlist will be promoted
        into it.
      </p>
      <label className="block t-label mb-1.5">Capacity</label>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setCap((v) => Math.max(4, v - 1))}
          aria-label="Decrease capacity"
          className="btn-ghost h-10 w-10 px-0"
        >
          −
        </button>
        <div className="h-10 flex-1 flex items-center justify-center rounded-md border border-rule bg-surface tnum t-body font-medium">
          {cap}
        </div>
        <button
          type="button"
          onClick={() => setCap((v) => Math.min(6, v + 1))}
          aria-label="Increase capacity"
          className="btn-ghost h-10 w-10 px-0"
        >
          +
        </button>
      </div>
      <p className="t-small text-ink-faint mb-4">Range: 4 to 6.</p>
      <Button fullWidth disabled={busy} onClick={() => onSubmit(cap)}>
        {busy ? 'Adding…' : `Add ${nextLabel}`}
      </Button>
    </Modal>
  );
}

function SetCostModal({
  open,
  onClose,
  onSubmit,
  busy,
  initialCents,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (dollarStr: string) => void;
  busy: boolean;
  initialCents: number | null;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open) {
      setValue(initialCents !== null ? (initialCents / 100).toFixed(2) : '');
    }
  }, [open, initialCents]);
  return (
    <Modal open={open} onClose={onClose} title="What did you pay total?">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-ink-soft t-body">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="86.40"
          autoFocus
          className="input-field tnum"
        />
      </div>
      <p className="t-small text-ink-faint mb-5">
        Divided by the number of slots, so +1s pay 2 shares.
      </p>
      <Button fullWidth disabled={busy || value.trim() === ''} onClick={() => onSubmit(value)}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </Modal>
  );
}

function SetCourtNumberModal({
  open,
  onClose,
  onSubmit,
  busy,
  court,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  busy: boolean;
  court: CourtView | null;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (open && court) setValue(court.bookedAs ?? '');
  }, [open, court]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={court ? `${court.label} — booked as` : 'Set court'}
    >
      <label className="block t-label mb-1.5">Real-world court number</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Court 3"
        autoFocus
        className="input-field"
      />
      <p className="t-small text-ink-faint mt-2 mb-5">Leave blank to clear.</p>
      <Button fullWidth disabled={busy} onClick={() => onSubmit(value)}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </Modal>
  );
}

function NamePromptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const { setName: persistName } = useIdentity();
  return (
    <Modal open={open} onClose={onClose} title="What's your name?" dismissOnBackdrop={false}>
      <p className="t-body text-ink-soft mb-3">
        Set a display name so the roster shows who you are.
      </p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Megha"
        autoFocus
        className="input-field mb-5"
      />
      <Button
        fullWidth
        disabled={name.trim() === ''}
        onClick={() => {
          persistName(name);
          onClose();
        }}
      >
        Continue
      </Button>
    </Modal>
  );
}

function buildRosterText(session: SessionView, venueText: string): string {
  const lines: string[] = [];
  lines.push(
    `${longDate(session.startsAt)} · ${longTimeRange(session.startsAt, session.endsAt)} · ${venueText}`,
  );
  lines.push('');
  for (const court of session.courts) {
    const header = court.bookedAs ? `${court.label} (${court.bookedAs}):` : `${court.label}:`;
    lines.push(header);
    court.slots.forEach((slot, idx) => {
      lines.push(`${idx + 1}. ${slot.displayName}`);
    });
    lines.push('');
  }
  if (session.waitlist.length > 0) {
    lines.push('Waitlist:');
    session.waitlist.forEach((slot, idx) => {
      lines.push(`W${idx + 1}. ${slot.displayName}`);
    });
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
// suppress unused-import warning for writeIdentity (consumed transitively via useIdentity)
void writeIdentity;
