/**
 * Session / court / slot service layer.
 *
 * All write operations:
 *   1. wrap in a postgres transaction,
 *   2. enforce auth (creator-or-self for drops, creator-only for mutations),
 *   3. emit an `events` row,
 *   4. auto-promote the top of the session waitlist whenever a confirmed slot
 *      drops or new capacity becomes available.
 *
 * Service API is unix-ms numbers for timestamps (matches the wire format from
 * route handlers). We convert to/from `Date` at the DB boundary; nothing
 * outside this file should see `Date` objects.
 *
 * No business logic lives in the route handlers — they validate, call into
 * here, and serialize whatever comes back.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client';
import { courts, events, sessions, slots } from '../db/schema';
import type { CourtRow, EventRow, SessionRow, SlotRow } from '../db/schema';
import { ServiceError } from '../errors';
import { generateCreatorCode, generateSlug } from '../ids';
import { ALL_VENUE_NAMES, OTHER_VENUE, getVenueMaxCourts, isKnownVenueName } from '../venues';
import type {
  CourtView,
  CreateSessionInput,
  EventView,
  SessionSummary,
  SessionView,
  SlotState,
  SlotView,
  UpdateSessionPatch,
} from './types';

// ─── Constants ─────────────────────────────────────────────────────────────

const MIN_CAPACITY = 4;
const MAX_CAPACITY = 6;
const DEFAULT_CAPACITY = 6;
const SLUG_GEN_MAX_ATTEMPTS = 8;
const RECENT_EVENTS_LIMIT = 10;

// A "Tx" is the inner argument Drizzle hands us inside `db.transaction(...)`.
// Drizzle types it the same as a `DbClient` (minus `.transaction()` recursion,
// but we don't use that), so we can alias them.
type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

// ─── Public API: sessions ──────────────────────────────────────────────────

export async function createSession(
  db: DbClient,
  input: CreateSessionInput,
): Promise<SessionView> {
  validateVenue(input.venue, input.venueCustom);
  if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt)) {
    throw new ServiceError('validation_failed', 'startsAt and endsAt must be unix-ms numbers');
  }
  if (input.endsAt <= input.startsAt) {
    throw new ServiceError('validation_failed', 'endsAt must be after startsAt');
  }
  if (!input.creatorDeviceId || input.creatorDeviceId.trim() === '') {
    throw new ServiceError('validation_failed', 'creatorDeviceId is required');
  }
  const capacity = clampCapacity(input.initialCapacity ?? DEFAULT_CAPACITY);

  return db.transaction(async (tx) => {
    const slug = await generateUniqueSlug(tx);
    const code = generateCreatorCode(slug);
    const now = new Date();

    await tx.insert(sessions).values({
      id: slug,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      venue: input.venue,
      venueCustom: input.venue === OTHER_VENUE ? (input.venueCustom ?? null) : null,
      totalCostCents: null,
      creatorDeviceId: input.creatorDeviceId,
      creatorCode: code,
      createdAt: now,
    });

    const inserted = await tx
      .insert(courts)
      .values({
        sessionId: slug,
        label: 'Court 1',
        bookedAs: null,
        capacity,
        position: 1,
        createdAt: now,
      })
      .returning({ id: courts.id });
    const courtId = inserted[0]?.id;
    if (!courtId) throw new ServiceError('internal_error', 'failed to insert initial court');

    await insertEvent(tx, {
      sessionId: slug,
      deviceId: input.creatorDeviceId,
      action: 'create_session',
      payload: {
        venue: input.venue,
        venueCustom: input.venueCustom ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        initialCapacity: capacity,
      },
    });

    return loadSessionView(tx, slug);
  });
}

export async function getSession(db: DbClient, sessionId: string): Promise<SessionView> {
  return loadSessionView(db, sessionId);
}

export async function getSessionSummary(
  db: DbClient,
  sessionId: string,
): Promise<SessionSummary> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  const row = rows[0];
  if (!row) throw notFound('session');
  return buildSummary(db, row);
}

export async function listUpcomingSessions(
  db: DbClient,
  now: number = Date.now(),
): Promise<SessionSummary[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(gte(sessions.endsAt, new Date(now)))
    .orderBy(asc(sessions.startsAt));
  return Promise.all(rows.map((r) => buildSummary(db, r)));
}

export async function listPastSessions(
  db: DbClient,
  now: number = Date.now(),
): Promise<SessionSummary[]> {
  const rows = await db
    .select()
    .from(sessions)
    .where(lt(sessions.endsAt, new Date(now)))
    .orderBy(desc(sessions.startsAt));
  return Promise.all(rows.map((r) => buildSummary(db, r)));
}

export async function updateSession(
  db: DbClient,
  sessionId: string,
  requesterDeviceId: string,
  patch: UpdateSessionPatch,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const session = await requireSession(tx, sessionId);
    requireCreator(session, requesterDeviceId);

    const next: Partial<typeof sessions.$inferInsert> = {};
    if (patch.startsAt !== undefined) {
      if (!Number.isFinite(patch.startsAt)) {
        throw new ServiceError('validation_failed', 'startsAt must be a number');
      }
      next.startsAt = new Date(patch.startsAt);
    }
    if (patch.endsAt !== undefined) {
      if (!Number.isFinite(patch.endsAt)) {
        throw new ServiceError('validation_failed', 'endsAt must be a number');
      }
      next.endsAt = new Date(patch.endsAt);
    }
    const finalStarts = next.startsAt ?? session.startsAt;
    const finalEnds = next.endsAt ?? session.endsAt;
    if (finalEnds.getTime() <= finalStarts.getTime()) {
      throw new ServiceError('validation_failed', 'endsAt must be after startsAt');
    }

    if (patch.venue !== undefined) {
      validateVenue(patch.venue, patch.venueCustom ?? session.venueCustom);
      next.venue = patch.venue;
      next.venueCustom = patch.venue === OTHER_VENUE ? (patch.venueCustom ?? null) : null;

      const cap = getVenueMaxCourts(patch.venue);
      if (cap !== null) {
        const countRows = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(courts)
          .where(eq(courts.sessionId, sessionId));
        const courtCount = countRows[0]?.n ?? 0;
        if (courtCount > cap) {
          throw new ServiceError(
            'conflict',
            `${patch.venue} allows at most ${cap} court(s); this session has ${courtCount}.`,
          );
        }
      }
    } else if (patch.venueCustom !== undefined) {
      if (session.venue !== OTHER_VENUE) {
        throw new ServiceError(
          'validation_failed',
          'venueCustom is only editable when venue is "Other"',
        );
      }
      next.venueCustom = patch.venueCustom;
    }

    if (Object.keys(next).length === 0) {
      return loadSessionView(tx, sessionId);
    }

    await tx.update(sessions).set(next).where(eq(sessions.id, sessionId));
    await insertEvent(tx, {
      sessionId,
      deviceId: requesterDeviceId,
      action: 'update_session',
      payload: {
        patch: serializePatchForEvent(next),
      },
    });
    return loadSessionView(tx, sessionId);
  });
}

export async function deleteSession(
  db: DbClient,
  sessionId: string,
  requesterDeviceId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const session = await requireSession(tx, sessionId);
    requireCreator(session, requesterDeviceId);
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
  });
}

/**
 * Rotate a session's creator code. Creator-only. Returns the fresh
 * SessionView plus the new code separately so the caller can flash it once
 * and not re-leak it through any cached view.
 *
 * We intentionally do NOT log the new code value into the events payload —
 * the audit trail records that a rotation happened, but the code itself
 * stays out of the activity feed (and out of any /events read).
 */
export async function rotateCreatorCode(
  db: DbClient,
  sessionId: string,
  requesterDeviceId: string,
): Promise<{ session: SessionView; code: string }> {
  return db.transaction(async (tx) => {
    const session = await requireSession(tx, sessionId);
    requireCreator(session, requesterDeviceId);

    const newCode = generateCreatorCode(session.id);
    await tx
      .update(sessions)
      .set({ creatorCode: newCode })
      .where(eq(sessions.id, sessionId));

    await insertEvent(tx, {
      sessionId,
      deviceId: requesterDeviceId,
      action: 'rotate_creator_code',
      payload: {},
    });

    const view = await loadSessionView(tx, sessionId);
    return { session: view, code: newCode };
  });
}

export async function setTotalCost(
  db: DbClient,
  sessionId: string,
  requesterDeviceId: string,
  cents: number | null,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const session = await requireSession(tx, sessionId);
    requireCreator(session, requesterDeviceId);
    if (cents !== null) {
      if (!Number.isFinite(cents) || cents < 0 || !Number.isInteger(cents)) {
        throw new ServiceError('validation_failed', 'cents must be a non-negative integer');
      }
    }
    await tx.update(sessions).set({ totalCostCents: cents }).where(eq(sessions.id, sessionId));
    await insertEvent(tx, {
      sessionId,
      deviceId: requesterDeviceId,
      action: 'set_cost',
      payload: { totalCostCents: cents },
    });
    return loadSessionView(tx, sessionId);
  });
}

// ─── Public API: courts ────────────────────────────────────────────────────

export async function addCourt(
  db: DbClient,
  sessionId: string,
  requesterDeviceId: string,
  capacity: number = DEFAULT_CAPACITY,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const session = await requireSession(tx, sessionId);
    requireCreator(session, requesterDeviceId);
    const cap = clampCapacity(capacity);

    const existing = await tx
      .select()
      .from(courts)
      .where(eq(courts.sessionId, sessionId))
      .orderBy(asc(courts.position));
    enforceVenueMaxCourts(session.venue, existing.length + 1);
    const lastPosition = existing[existing.length - 1]?.position ?? 0;
    const nextPosition = lastPosition + 1;

    const inserted = await tx
      .insert(courts)
      .values({
        sessionId,
        label: `Court ${nextPosition}`,
        bookedAs: null,
        capacity: cap,
        position: nextPosition,
      })
      .returning({ id: courts.id });
    const newCourtId = inserted[0]?.id;
    if (!newCourtId) throw new ServiceError('internal_error', 'failed to insert court');

    await insertEvent(tx, {
      sessionId,
      deviceId: requesterDeviceId,
      action: 'add_court',
      payload: { courtId: newCourtId, capacity: cap, position: nextPosition },
    });

    await promoteFromWaitlistInto(tx, sessionId, newCourtId, cap);

    return loadSessionView(tx, sessionId);
  });
}

export async function setCourtCapacity(
  db: DbClient,
  courtId: string,
  requesterDeviceId: string,
  newCapacity: number,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const court = await requireCourt(tx, courtId);
    const session = await requireSession(tx, court.sessionId);
    requireCreator(session, requesterDeviceId);
    const newCap = clampCapacity(newCapacity);

    const countRows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(slots)
      .where(and(eq(slots.courtId, courtId), eq(slots.state, 'confirmed')));
    const confirmedCount = countRows[0]?.n ?? 0;

    if (newCap < confirmedCount) {
      throw new ServiceError(
        'conflict',
        `Cannot lower capacity to ${newCap}; ${confirmedCount} slot(s) are already confirmed on this court.`,
        { currentConfirmed: confirmedCount, requestedCapacity: newCap },
      );
    }

    await tx.update(courts).set({ capacity: newCap }).where(eq(courts.id, courtId));
    await insertEvent(tx, {
      sessionId: court.sessionId,
      deviceId: requesterDeviceId,
      action: 'set_court_capacity',
      payload: { courtId, capacity: newCap },
    });

    if (newCap > confirmedCount) {
      const room = newCap - confirmedCount;
      await promoteFromWaitlistInto(tx, court.sessionId, courtId, room);
    }

    return loadSessionView(tx, court.sessionId);
  });
}

export async function setCourtNumber(
  db: DbClient,
  courtId: string,
  requesterDeviceId: string,
  bookedAs: string | null,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const court = await requireCourt(tx, courtId);
    const session = await requireSession(tx, court.sessionId);
    requireCreator(session, requesterDeviceId);
    const value = bookedAs === null ? null : bookedAs.trim() === '' ? null : bookedAs.trim();
    await tx.update(courts).set({ bookedAs: value }).where(eq(courts.id, courtId));
    await insertEvent(tx, {
      sessionId: court.sessionId,
      deviceId: requesterDeviceId,
      action: 'set_court_number',
      payload: { courtId, bookedAs: value },
    });
    return loadSessionView(tx, court.sessionId);
  });
}

// ─── Public API: slots ─────────────────────────────────────────────────────

export interface JoinSessionInput {
  sessionId: string;
  deviceId: string;
  displayName: string;
}

export async function joinSession(db: DbClient, input: JoinSessionInput): Promise<SlotView> {
  const displayName = (input.displayName ?? '').trim();
  if (displayName === '') {
    throw new ServiceError('validation_failed', 'displayName is required');
  }
  if (!input.deviceId || input.deviceId.trim() === '') {
    throw new ServiceError('validation_failed', 'deviceId is required');
  }

  return db.transaction(async (tx) => {
    await requireSession(tx, input.sessionId);
    const slot = await insertSlot(tx, {
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      displayName,
      isPlusOne: false,
      plusOneOf: null,
    });
    await insertEvent(tx, {
      sessionId: input.sessionId,
      deviceId: input.deviceId,
      action: 'join',
      payload: {
        slotId: slot.id,
        state: slot.state,
        courtId: slot.courtId,
        position: slot.position,
        displayName,
      },
    });
    return slot;
  });
}

export interface AddPlusOneInput {
  sessionId: string;
  ownerSlotId: string;
  requesterDeviceId: string;
  plusOneName: string;
}

export async function addPlusOne(db: DbClient, input: AddPlusOneInput): Promise<SlotView> {
  const name = (input.plusOneName ?? '').trim();
  if (name === '') {
    throw new ServiceError('validation_failed', 'plusOneName is required');
  }

  return db.transaction(async (tx) => {
    const ownerRows = await tx.select().from(slots).where(eq(slots.id, input.ownerSlotId));
    const owner = ownerRows[0];
    if (!owner) throw notFound('slot');
    if (owner.sessionId !== input.sessionId) {
      throw new ServiceError('validation_failed', 'ownerSlot does not belong to this session');
    }
    if (owner.state === 'dropped') {
      throw new ServiceError('validation_failed', 'cannot add a +1 to a dropped slot');
    }
    if (owner.deviceId !== input.requesterDeviceId) {
      throw new ServiceError('unauthorized', 'only the slot owner can add a +1 to it');
    }
    if (owner.isPlusOne) {
      throw new ServiceError('validation_failed', 'a +1 cannot itself have a +1');
    }

    const slot = await insertSlot(tx, {
      sessionId: input.sessionId,
      deviceId: input.requesterDeviceId,
      displayName: name,
      isPlusOne: true,
      plusOneOf: owner.id,
    });

    await insertEvent(tx, {
      sessionId: input.sessionId,
      deviceId: input.requesterDeviceId,
      action: 'add_plus_one',
      payload: {
        slotId: slot.id,
        ownerSlotId: owner.id,
        state: slot.state,
        courtId: slot.courtId,
        position: slot.position,
        displayName: name,
      },
    });
    return slot;
  });
}

export async function dropSlot(
  db: DbClient,
  slotId: string,
  requesterDeviceId: string,
): Promise<SessionView> {
  return db.transaction(async (tx) => {
    const slotRows = await tx.select().from(slots).where(eq(slots.id, slotId));
    const slot = slotRows[0];
    if (!slot) throw notFound('slot');
    const session = await requireSession(tx, slot.sessionId);

    const isSelf = slot.deviceId !== null && slot.deviceId === requesterDeviceId;
    const isCreator = session.creatorDeviceId === requesterDeviceId;
    if (!isSelf && !isCreator) {
      throw new ServiceError(
        'unauthorized',
        'only the slot owner or the session creator can drop this slot',
      );
    }

    if (slot.state === 'dropped') {
      return loadSessionView(tx, slot.sessionId);
    }

    const wasConfirmed = slot.state === 'confirmed';
    const freedCourtId = wasConfirmed ? slot.courtId : null;
    const oldPosition = slot.position;
    const oldState = slot.state;

    const now = new Date();
    await tx
      .update(slots)
      .set({ state: 'dropped', courtId: null, updatedAt: now })
      .where(eq(slots.id, slotId));

    if (wasConfirmed && freedCourtId) {
      // Confirmed positions are unique per court; we don't compact them —
      // the empty slot is filled visually by waitlist promotion.
    } else {
      // Waitlist drop: everyone behind shifts up.
      await tx
        .update(slots)
        .set({ position: sql`${slots.position} - 1` })
        .where(
          and(
            eq(slots.sessionId, slot.sessionId),
            eq(slots.state, 'waitlist'),
            sql`${slots.position} > ${oldPosition}`,
          ),
        );
    }

    let promotedSlotId: string | null = null;
    if (wasConfirmed && freedCourtId) {
      promotedSlotId = await promoteOneIntoCourt(tx, slot.sessionId, freedCourtId, oldPosition);
    }

    await insertEvent(tx, {
      sessionId: slot.sessionId,
      deviceId: requesterDeviceId,
      action: 'drop',
      payload: {
        slotId,
        droppedFrom: oldState,
        actor: isSelf ? 'self' : 'creator',
        ownerDeviceId: slot.deviceId,
        promotedSlotId,
        freedCourtId,
      },
    });

    if (promotedSlotId) {
      await insertEvent(tx, {
        sessionId: slot.sessionId,
        deviceId: null,
        action: 'auto_promote',
        payload: {
          slotId: promotedSlotId,
          courtId: freedCourtId,
          position: oldPosition,
        },
      });
    }

    return loadSessionView(tx, slot.sessionId);
  });
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function clampCapacity(n: number): number {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ServiceError('validation_failed', 'capacity must be an integer');
  }
  if (n < MIN_CAPACITY || n > MAX_CAPACITY) {
    throw new ServiceError(
      'validation_failed',
      `capacity must be between ${MIN_CAPACITY} and ${MAX_CAPACITY}`,
    );
  }
  return n;
}

function validateVenue(venue: string, venueCustom: string | null | undefined): void {
  if (!ALL_VENUE_NAMES.includes(venue as (typeof ALL_VENUE_NAMES)[number])) {
    throw new ServiceError(
      'validation_failed',
      `unknown venue '${venue}'. allowed: ${ALL_VENUE_NAMES.join(', ')}`,
    );
  }
  if (venue === OTHER_VENUE) {
    const custom = (venueCustom ?? '').trim();
    if (custom === '') {
      throw new ServiceError(
        'validation_failed',
        'venueCustom is required when venue is "Other"',
      );
    }
  } else if (!isKnownVenueName(venue)) {
    throw new ServiceError('validation_failed', `invalid venue '${venue}'`);
  }
}

function enforceVenueMaxCourts(venueName: string, requestedCount: number): void {
  const cap = getVenueMaxCourts(venueName);
  if (cap !== null && requestedCount > cap) {
    throw new ServiceError(
      'conflict',
      `${venueName} allows at most ${cap} court(s); cannot add another.`,
      { cap, requestedCount, venue: venueName },
    );
  }
}

async function generateUniqueSlug(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < SLUG_GEN_MAX_ATTEMPTS; attempt++) {
    const candidate = generateSlug(4);
    const existing = await tx.select().from(sessions).where(eq(sessions.id, candidate));
    if (existing.length === 0) return candidate;
  }
  throw new ServiceError('internal_error', 'failed to generate a unique session slug');
}

function notFound(what: string): ServiceError {
  return new ServiceError('not_found', `${what} not found`);
}

async function requireSession(tx: Tx | DbClient, sessionId: string): Promise<SessionRow> {
  const rows = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
  const row = rows[0];
  if (!row) throw notFound('session');
  return row;
}

async function requireCourt(tx: Tx, courtId: string): Promise<CourtRow> {
  const rows = await tx.select().from(courts).where(eq(courts.id, courtId));
  const row = rows[0];
  if (!row) throw notFound('court');
  return row;
}

function requireCreator(session: SessionRow, requesterDeviceId: string): void {
  if (session.creatorDeviceId !== requesterDeviceId) {
    throw new ServiceError('unauthorized', 'only the session creator can perform this action');
  }
}

interface InsertSlotInput {
  sessionId: string;
  deviceId: string | null;
  displayName: string;
  isPlusOne: boolean;
  plusOneOf: string | null;
}

/**
 * Assigns a new slot to the first court with room, or to the back of the
 * session waitlist if all courts are full.
 */
async function insertSlot(tx: Tx, input: InsertSlotInput): Promise<SlotView> {
  const courtList = await tx
    .select()
    .from(courts)
    .where(eq(courts.sessionId, input.sessionId))
    .orderBy(asc(courts.position));

  const confirmedCounts = new Map<string, number>();
  if (courtList.length > 0) {
    const courtIds = courtList.map((c) => c.id);
    const rows = await tx
      .select({ courtId: slots.courtId, n: sql<number>`count(*)::int` })
      .from(slots)
      .where(and(eq(slots.state, 'confirmed'), inArray(slots.courtId, courtIds)))
      .groupBy(slots.courtId);
    for (const row of rows) {
      if (row.courtId) confirmedCounts.set(row.courtId, Number(row.n));
    }
  }

  const targetCourt = courtList.find((c) => (confirmedCounts.get(c.id) ?? 0) < c.capacity);

  const now = new Date();
  let state: SlotState;
  let courtId: string | null;
  let position: number;

  if (targetCourt) {
    state = 'confirmed';
    courtId = targetCourt.id;
    const maxRows = await tx
      .select({ p: sql<number | null>`max(${slots.position})` })
      .from(slots)
      .where(and(eq(slots.courtId, targetCourt.id), eq(slots.state, 'confirmed')));
    const maxPos = maxRows[0]?.p ?? 0;
    position = Number(maxPos) + 1;
  } else {
    state = 'waitlist';
    courtId = null;
    const maxRows = await tx
      .select({ p: sql<number | null>`max(${slots.position})` })
      .from(slots)
      .where(and(eq(slots.sessionId, input.sessionId), eq(slots.state, 'waitlist')));
    const maxPos = maxRows[0]?.p ?? 0;
    position = Number(maxPos) + 1;
  }

  const inserted = await tx
    .insert(slots)
    .values({
      sessionId: input.sessionId,
      courtId,
      deviceId: input.deviceId,
      displayName: input.displayName,
      isPlusOne: input.isPlusOne,
      plusOneOf: input.plusOneOf,
      state,
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new ServiceError('internal_error', 'failed to insert slot');
  return slotRowToView(row);
}

/**
 * Promote a single slot off the head of the session waitlist into `courtId`
 * at `targetPosition`. Returns the promoted slot id or null if no one was
 * waiting. Also shifts the remaining waitlist positions up by 1.
 */
async function promoteOneIntoCourt(
  tx: Tx,
  sessionId: string,
  courtId: string,
  targetPosition: number,
): Promise<string | null> {
  const heads = await tx
    .select()
    .from(slots)
    .where(and(eq(slots.sessionId, sessionId), eq(slots.state, 'waitlist')))
    .orderBy(asc(slots.position))
    .limit(1);
  const head = heads[0];
  if (!head) return null;

  const headPosition = head.position;
  const now = new Date();
  await tx
    .update(slots)
    .set({ state: 'confirmed', courtId, position: targetPosition, updatedAt: now })
    .where(eq(slots.id, head.id));

  await tx
    .update(slots)
    .set({ position: sql`${slots.position} - 1` })
    .where(
      and(
        eq(slots.sessionId, sessionId),
        eq(slots.state, 'waitlist'),
        sql`${slots.position} > ${headPosition}`,
      ),
    );

  return head.id;
}

/**
 * Promote up to `room` slots into the given court, taking new confirmed
 * positions at the tail of the court's existing confirmed roster. Used by
 * `addCourt` and `setCourtCapacity` (raise).
 */
async function promoteFromWaitlistInto(
  tx: Tx,
  sessionId: string,
  courtId: string,
  room: number,
): Promise<void> {
  if (room <= 0) return;

  const maxRows = await tx
    .select({ p: sql<number | null>`max(${slots.position})` })
    .from(slots)
    .where(and(eq(slots.courtId, courtId), eq(slots.state, 'confirmed')));
  let nextPos = Number(maxRows[0]?.p ?? 0) + 1;

  const heads = await tx
    .select()
    .from(slots)
    .where(and(eq(slots.sessionId, sessionId), eq(slots.state, 'waitlist')))
    .orderBy(asc(slots.position))
    .limit(room);
  if (heads.length === 0) return;

  for (const head of heads) {
    const now = new Date();
    await tx
      .update(slots)
      .set({ state: 'confirmed', courtId, position: nextPos, updatedAt: now })
      .where(eq(slots.id, head.id));
    await insertEvent(tx, {
      sessionId,
      deviceId: null,
      action: 'auto_promote',
      payload: { slotId: head.id, courtId, position: nextPos },
    });
    nextPos += 1;
  }

  // Compact remaining waitlist so positions are 1..N again.
  const remaining = await tx
    .select()
    .from(slots)
    .where(and(eq(slots.sessionId, sessionId), eq(slots.state, 'waitlist')))
    .orderBy(asc(slots.position));
  for (let i = 0; i < remaining.length; i++) {
    const r = remaining[i];
    if (!r) continue;
    const newPos = i + 1;
    if (r.position !== newPos) {
      await tx.update(slots).set({ position: newPos }).where(eq(slots.id, r.id));
    }
  }
}

interface InsertEventInput {
  sessionId: string;
  deviceId: string | null;
  action: string;
  payload: Record<string, unknown>;
}

async function insertEvent(tx: Tx, input: InsertEventInput): Promise<void> {
  await tx.insert(events).values({
    sessionId: input.sessionId,
    deviceId: input.deviceId,
    action: input.action,
    payload: input.payload,
    createdAt: new Date(),
  });
}

// `Date` values are not JSON-safe; flatten any patch we record into events.
function serializePatchForEvent(
  patch: Partial<typeof sessions.$inferInsert>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v instanceof Date ? v.getTime() : v;
  }
  return out;
}

// ─── Loaders / projections ─────────────────────────────────────────────────

async function loadSessionView(tx: Tx | DbClient, sessionId: string): Promise<SessionView> {
  const session = await requireSession(tx, sessionId);
  const courtRows = await tx
    .select()
    .from(courts)
    .where(eq(courts.sessionId, sessionId))
    .orderBy(asc(courts.position));
  const slotRows = await tx
    .select()
    .from(slots)
    .where(eq(slots.sessionId, sessionId))
    .orderBy(asc(slots.position));
  const eventRows = await tx
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(desc(events.createdAt))
    .limit(RECENT_EVENTS_LIMIT);

  const courtViews: CourtView[] = courtRows.map((c) => ({
    id: c.id,
    sessionId: c.sessionId,
    label: c.label,
    bookedAs: c.bookedAs,
    capacity: c.capacity,
    position: c.position,
    createdAt: c.createdAt.getTime(),
    slots: slotRows
      .filter((s) => s.courtId === c.id && s.state === 'confirmed')
      .sort((a, b) => a.position - b.position)
      .map(slotRowToView),
  }));

  const waitlist: SlotView[] = slotRows
    .filter((s) => s.state === 'waitlist')
    .sort((a, b) => a.position - b.position)
    .map(slotRowToView);

  return {
    id: session.id,
    startsAt: session.startsAt.getTime(),
    endsAt: session.endsAt.getTime(),
    venue: session.venue,
    venueCustom: session.venueCustom,
    totalCostCents: session.totalCostCents,
    creatorDeviceId: session.creatorDeviceId,
    creatorCode: session.creatorCode,
    createdAt: session.createdAt.getTime(),
    courts: courtViews,
    waitlist,
    recentEvents: eventRows.map(eventRowToView),
  };
}

async function buildSummary(db: DbClient | Tx, session: SessionRow): Promise<SessionSummary> {
  const courtRows = await db
    .select({ capacity: courts.capacity })
    .from(courts)
    .where(eq(courts.sessionId, session.id));
  const totalCapacity = courtRows.reduce((sum, c) => sum + c.capacity, 0);

  const counts = await db
    .select({ state: slots.state, n: sql<number>`count(*)::int` })
    .from(slots)
    .where(eq(slots.sessionId, session.id))
    .groupBy(slots.state);

  let confirmedCount = 0;
  let waitlistCount = 0;
  for (const row of counts) {
    if (row.state === 'confirmed') confirmedCount = Number(row.n);
    else if (row.state === 'waitlist') waitlistCount = Number(row.n);
  }

  return {
    id: session.id,
    startsAt: session.startsAt.getTime(),
    endsAt: session.endsAt.getTime(),
    venue: session.venue,
    venueCustom: session.venueCustom,
    totalCapacity,
    confirmedCount,
    waitlistCount,
  };
}

function slotRowToView(row: SlotRow): SlotView {
  const state = row.state as SlotState;
  return {
    id: row.id,
    sessionId: row.sessionId,
    courtId: row.courtId,
    deviceId: row.deviceId,
    displayName: row.displayName,
    isPlusOne: row.isPlusOne,
    plusOneOf: row.plusOneOf,
    state,
    position: row.position,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function eventRowToView(row: EventRow): EventView {
  // jsonb comes back as a parsed object already.
  let payload: Record<string, unknown> = {};
  if (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
    payload = row.payload as Record<string, unknown>;
  }
  return {
    id: row.id,
    sessionId: row.sessionId,
    deviceId: row.deviceId,
    action: row.action,
    payload,
    createdAt: row.createdAt.getTime(),
  };
}
