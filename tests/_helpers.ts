/**
 * Shared plumbing for the integration test suite.
 *
 * Every test file:
 *   - in `beforeEach`, calls `resetDb()` to wipe `sessions` (children cascade)
 *   - in `afterAll`, calls `closeAll()` to release the postgres pool so vitest
 *     can exit cleanly
 *
 * Tests share the singleton `getDb()` client — vitest runs in a single fork
 * with `concurrent: false`, so there is no cross-test pool contention.
 */
import { closeDb, getDb } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';
import {
  addCourt as svcAddCourt,
  addPlusOne as svcAddPlusOne,
  createSession as svcCreateSession,
  joinSession as svcJoinSession,
} from '@/lib/services';
import type { SessionView, SlotView } from '@/lib/services/types';

export const TEST_CREATOR_DEVICE = 'test-creator-device';

export async function resetDb(): Promise<void> {
  const db = getDb();
  // `sessions` has ON DELETE CASCADE to courts/slots/events.
  await db.delete(sessions);
}

export async function closeAll(): Promise<void> {
  await closeDb();
}

interface SeedSessionOptions {
  startsAtOffsetMs?: number; // default: 1h from now
  durationMs?: number; // default: 2h
  venue?: 'Shuttl' | 'OneA' | 'Other';
  venueCustom?: string | null;
  initialCapacity?: number; // default 6
  creatorDeviceId?: string;
}

/**
 * Create a session via the service layer. Returns the full view.
 */
export async function seedSession(opts: SeedSessionOptions = {}): Promise<SessionView> {
  const now = Date.now();
  const startsAt = now + (opts.startsAtOffsetMs ?? 60 * 60 * 1000);
  const endsAt = startsAt + (opts.durationMs ?? 2 * 60 * 60 * 1000);
  return svcCreateSession(getDb(), {
    startsAt,
    endsAt,
    venue: opts.venue ?? 'Shuttl',
    venueCustom: opts.venueCustom ?? null,
    creatorDeviceId: opts.creatorDeviceId ?? TEST_CREATOR_DEVICE,
    initialCapacity: opts.initialCapacity,
  });
}

/**
 * Add `count` joiners to a session, one per fresh device id. Returns the
 * created slot views in order.
 */
export async function joinN(
  sessionId: string,
  count: number,
  namePrefix = 'Player',
): Promise<SlotView[]> {
  const out: SlotView[] = [];
  for (let i = 0; i < count; i++) {
    const slot = await svcJoinSession(getDb(), {
      sessionId,
      deviceId: `device-${namePrefix}-${i + 1}`,
      displayName: `${namePrefix} ${i + 1}`,
    });
    out.push(slot);
  }
  return out;
}

export const seed = {
  session: seedSession,
  joinN,
  joinOne: (sessionId: string, deviceId: string, displayName: string) =>
    svcJoinSession(getDb(), { sessionId, deviceId, displayName }),
  plusOne: (sessionId: string, ownerSlotId: string, deviceId: string, name: string) =>
    svcAddPlusOne(getDb(), {
      sessionId,
      ownerSlotId,
      requesterDeviceId: deviceId,
      plusOneName: name,
    }),
  addCourt: (sessionId: string, deviceId: string, capacity = 6) =>
    svcAddCourt(getDb(), sessionId, deviceId, capacity),
};
