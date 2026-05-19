/**
 * Derived/computed state helpers over a SessionView. Pure functions; the UI
 * uses them to decide which CTAs to show, where "you" sit, etc.
 *
 * Auth model is "creator-or-self" — encoded once here so the components stay
 * dumb.
 */

import type { SessionView, SlotView } from '@/lib/services/types';

export interface SessionDerived {
  /** Total capacity across all courts. */
  totalCapacity: number;
  /** Number of confirmed slots across all courts. */
  confirmedCount: number;
  /** Total slots (confirmed + waitlist), used for cost split. */
  totalSlots: number;
  isCreator: boolean;
  /** Your non-dropped slots in the session, in createdAt order. */
  yourSlots: SlotView[];
  /** Your primary non-+1 slot, if any. */
  yourPrimarySlot: SlotView | null;
  /** Your +1 slots. */
  yourPlusOnes: SlotView[];
  /** True if you have any active slot (confirmed or waitlist). */
  isMember: boolean;
  /** True if you have a confirmed primary slot. */
  isConfirmed: boolean;
  /** True if you have a waitlist primary slot. */
  isOnWaitlist: boolean;
  /** True if you previously had a slot but dropped it (and don't have a new one). */
  hasDropped: boolean;
  /** Sum of confirmed + waitlist. */
  totalActiveSlots: number;
}

export function deriveSession(
  session: SessionView,
  deviceId: string | null,
): SessionDerived {
  const totalCapacity = session.courts.reduce((sum, c) => sum + c.capacity, 0);
  const confirmedCount = session.courts.reduce((sum, c) => sum + c.slots.length, 0);
  const totalActiveSlots = confirmedCount + session.waitlist.length;

  const isCreator =
    deviceId !== null && deviceId !== '' && session.creatorDeviceId === deviceId;

  let yourSlots: SlotView[] = [];
  if (deviceId) {
    yourSlots = collectActiveSlots(session).filter((s) => s.deviceId === deviceId);
  }

  const yourPrimary = yourSlots.find((s) => !s.isPlusOne) ?? null;
  const yourPlusOnes = yourSlots.filter((s) => s.isPlusOne);

  // "hasDropped" — show the Rejoin variant. Only if we know about a dropped
  // slot owned by this device AND there's no active one. Recent events carry
  // drop info but we don't have the full slot list (dropped slots aren't in
  // session.courts or session.waitlist) — fall back to inspecting
  // recentEvents for a drop attributed to this device.
  let hasDropped = false;
  if (deviceId && yourSlots.length === 0) {
    hasDropped = session.recentEvents.some(
      (e) =>
        e.action === 'drop' &&
        (e.payload?.ownerDeviceId === deviceId || e.deviceId === deviceId),
    );
  }

  return {
    totalCapacity,
    confirmedCount,
    totalSlots: totalActiveSlots,
    isCreator,
    yourSlots,
    yourPrimarySlot: yourPrimary,
    yourPlusOnes,
    isMember: yourSlots.length > 0,
    isConfirmed: yourPrimary?.state === 'confirmed',
    isOnWaitlist: yourPrimary?.state === 'waitlist',
    hasDropped,
    totalActiveSlots,
  };
}

function collectActiveSlots(session: SessionView): SlotView[] {
  const out: SlotView[] = [];
  for (const court of session.courts) {
    for (const slot of court.slots) out.push(slot);
  }
  for (const slot of session.waitlist) out.push(slot);
  return out;
}

/**
 * Build a map of slot.id -> displayName for every active slot. Useful for
 * resolving `plusOneOf` -> the host's name in slot rows.
 */
export function slotNameMap(session: SessionView): Map<string, string> {
  const out = new Map<string, string>();
  for (const court of session.courts) {
    for (const slot of court.slots) out.set(slot.id, slot.displayName);
  }
  for (const slot of session.waitlist) out.set(slot.id, slot.displayName);
  return out;
}

/**
 * Per the spec, "courts have room" = at least one court is below capacity.
 */
export function hasOpenCourtSpot(session: SessionView): boolean {
  return session.courts.some((c) => c.slots.length < c.capacity);
}

export interface DropAuth {
  canDrop: boolean;
  isSelf: boolean;
}

export function canDropSlot(
  slot: SlotView,
  session: SessionView,
  deviceId: string | null,
): DropAuth {
  if (!deviceId) return { canDrop: false, isSelf: false };
  if (slot.state === 'dropped') return { canDrop: false, isSelf: false };
  // Past sessions are read-only — no one (not even the creator) can change
  // the roster after the fact. Anyone scrolling back is looking at history.
  if (session.endsAt < Date.now()) return { canDrop: false, isSelf: false };
  const isSelf = slot.deviceId === deviceId;
  const isCreator = session.creatorDeviceId === deviceId;
  return { canDrop: isSelf || isCreator, isSelf };
}

/** Status for the home/history badge against this device. */
export type SessionStatus =
  | { kind: 'confirmed'; courtLabel: string; position: number }
  | { kind: 'waitlist'; position: number }
  | { kind: 'not_voted' }
  | { kind: 'dropped' }
  | { kind: 'lead_only' };

export function statusForSession(
  session: SessionView,
  deviceId: string | null,
): SessionStatus {
  const derived = deriveSession(session, deviceId);
  if (derived.yourPrimarySlot) {
    const primary = derived.yourPrimarySlot;
    if (primary.state === 'confirmed') {
      const court = session.courts.find((c) => c.id === primary.courtId);
      const positionWithinCourt = court
        ? court.slots.findIndex((s) => s.id === primary.id) + 1
        : primary.position;
      return {
        kind: 'confirmed',
        courtLabel: court?.label ?? 'Court',
        position: positionWithinCourt,
      };
    }
    if (primary.state === 'waitlist') {
      const positionWithinWaitlist =
        session.waitlist.findIndex((s) => s.id === primary.id) + 1;
      return { kind: 'waitlist', position: positionWithinWaitlist || primary.position };
    }
  }
  if (derived.isCreator) return { kind: 'lead_only' };
  if (derived.hasDropped) return { kind: 'dropped' };
  return { kind: 'not_voted' };
}
