import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { addCourt, getSession, setCourtCapacity } from '@/lib/services';
import { closeAll, joinN, resetDb, seedSession, TEST_CREATOR_DEVICE } from '../_helpers';

describe('court capacity', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('refuses to lower capacity below currently confirmed count', async () => {
    const session = await seedSession({ initialCapacity: 6 });
    const court = session.courts[0]!;
    await joinN(session.id, 5, 'C');

    try {
      await setCourtCapacity(getDb(), court.id, TEST_CREATOR_DEVICE, 4);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('conflict');
    }
  });

  it('raising capacity 4 → 6 with 3 on waitlist promotes 2 waitlist members', async () => {
    const session = await seedSession({ initialCapacity: 4 });
    const court = session.courts[0]!;
    // Fill court (4 confirmed)
    await joinN(session.id, 4, 'C');
    // 3 on waitlist
    const wl = await joinN(session.id, 3, 'W');

    const after = await setCourtCapacity(getDb(), court.id, TEST_CREATOR_DEVICE, 6);

    // Court should now hold 6 confirmed
    expect(after.courts[0]?.slots).toHaveLength(6);
    // Only 1 remaining on the waitlist (the original W3)
    expect(after.waitlist).toHaveLength(1);
    expect(after.waitlist[0]?.id).toBe(wl[2]!.id);
    expect(after.waitlist[0]?.position).toBe(1);
  });

  it('addCourt with 5 on waitlist + new court cap 6 promotes all 5', async () => {
    const session = await seedSession({ initialCapacity: 6 });
    // Fill first court
    await joinN(session.id, 6, 'C');
    // 5 on waitlist
    await joinN(session.id, 5, 'W');

    const after = await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
    expect(after.courts).toHaveLength(2);
    // First court still has 6
    expect(after.courts[0]?.slots).toHaveLength(6);
    // Second court promoted all 5 waitlisters
    expect(after.courts[1]?.slots).toHaveLength(5);
    // Waitlist empty
    expect(after.waitlist).toHaveLength(0);
  });

  it('addCourt promotes up to new court capacity when waitlist is longer', async () => {
    const session = await seedSession({ initialCapacity: 6 });
    await joinN(session.id, 6, 'C');
    await joinN(session.id, 9, 'W'); // 9 waiting

    const after = await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
    expect(after.courts[1]?.slots).toHaveLength(6);
    // 3 remain on the waitlist, renumbered 1..3
    expect(after.waitlist).toHaveLength(3);
    const positions = after.waitlist.map((s) => s.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('only the creator can change capacity', async () => {
    const session = await seedSession();
    const court = session.courts[0]!;
    try {
      await setCourtCapacity(getDb(), court.id, 'not-the-creator', 5);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('unauthorized');
    }
    // sanity
    const view = await getSession(getDb(), session.id);
    expect(view.courts[0]?.capacity).toBe(6);
  });
});
