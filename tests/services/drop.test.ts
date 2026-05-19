import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { dropSlot, getSession } from '@/lib/services';
import { closeAll, joinN, resetDb, seedSession, TEST_CREATOR_DEVICE } from '../_helpers';

describe('dropSlot', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('6 confirmed + 3 waitlist → drop one confirmed promotes waitlist#1; rest renumber 1..2', async () => {
    const session = await seedSession();
    const court = session.courts[0]!;
    const six = await joinN(session.id, 6, 'C');
    const three = await joinN(session.id, 3, 'W');

    // sanity
    expect(three[0]?.position).toBe(1);
    expect(three[1]?.position).toBe(2);
    expect(three[2]?.position).toBe(3);

    // Drop the 3rd confirmed
    const dropTarget = six[2]!;
    await dropSlot(getDb(), dropTarget.id, dropTarget.deviceId!);

    const after = await getSession(getDb(), session.id);

    // The promoted slot is whoever was W1 (three[0])
    const promoted = after.courts[0]?.slots.find((s) => s.id === three[0]?.id);
    expect(promoted).toBeDefined();
    expect(promoted?.state).toBe('confirmed');
    expect(promoted?.courtId).toBe(court.id);

    // Waitlist now has W2 (three[1]) and W3 (three[2]) at positions 1, 2
    expect(after.waitlist).toHaveLength(2);
    const w1 = after.waitlist.find((s) => s.id === three[1]?.id);
    const w2 = after.waitlist.find((s) => s.id === three[2]?.id);
    expect(w1?.position).toBe(1);
    expect(w2?.position).toBe(2);
  });

  it('FCFS rejoin: drop self then rejoin → new slot lands at the back of the waitlist', async () => {
    const session = await seedSession();
    // Fill court 1 with 6
    await joinN(session.id, 6, 'F');
    // Add 2 to waitlist
    const wlInitial = await joinN(session.id, 2, 'W');

    // Add Bob to waitlist (will be W3)
    const bob = await getDb().transaction(async (_tx) => {
      // use the service for parity
      return (
        await import('@/lib/services')
      ).joinSession(getDb(), {
        sessionId: session.id,
        deviceId: 'device-bob',
        displayName: 'Bob',
      });
    });
    expect(bob.state).toBe('waitlist');
    expect(bob.position).toBe(3);

    // Bob drops himself
    await dropSlot(getDb(), bob.id, 'device-bob');

    let after = await getSession(getDb(), session.id);
    // Waitlist now has the original two only
    expect(after.waitlist).toHaveLength(2);
    expect(after.waitlist.map((s) => s.id).sort()).toEqual(
      [wlInitial[0]?.id, wlInitial[1]?.id].sort(),
    );

    // Bob rejoins → fresh slot, should be at the BACK (position 3)
    const bobAgain = await (
      await import('@/lib/services')
    ).joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-bob',
      displayName: 'Bob',
    });
    expect(bobAgain.state).toBe('waitlist');
    expect(bobAgain.id).not.toBe(bob.id); // new slot row

    after = await getSession(getDb(), session.id);
    const maxWaitlistPos = Math.max(...after.waitlist.map((s) => s.position));
    expect(bobAgain.position).toBe(maxWaitlistPos);
    // And strictly larger than every other existing waitlist slot's position
    const otherWaitlist = after.waitlist.filter((s) => s.id !== bobAgain.id);
    for (const other of otherWaitlist) {
      expect(bobAgain.position).toBeGreaterThan(other.position);
    }
  });

  it('drop by random third-party device throws ServiceError unauthorized', async () => {
    const session = await seedSession();
    const [alice] = await joinN(session.id, 1, 'A');
    expect(alice).toBeDefined();
    try {
      await dropSlot(getDb(), alice!.id, 'random-stranger-device');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('unauthorized');
    }
  });

  it('drop by the session creator on someone else’s slot succeeds', async () => {
    const session = await seedSession();
    const [alice] = await joinN(session.id, 1, 'A');
    // creator drops alice
    await dropSlot(getDb(), alice!.id, TEST_CREATOR_DEVICE);

    const after = await getSession(getDb(), session.id);
    const found = after.courts[0]?.slots.find((s) => s.id === alice!.id);
    // Alice should no longer be on the court roster (state went to dropped)
    expect(found).toBeUndefined();
  });

  it('dropping a waitlist slot does NOT promote anyone', async () => {
    const session = await seedSession();
    await joinN(session.id, 6, 'F');
    const wl = await joinN(session.id, 2, 'W');

    await dropSlot(getDb(), wl[0]!.id, wl[0]!.deviceId!);
    const after = await getSession(getDb(), session.id);

    // No new auto_promote should have happened
    const promotes = after.recentEvents.filter((e) => e.action === 'auto_promote');
    expect(promotes).toHaveLength(0);

    // Court still has 6 confirmed
    expect(after.courts[0]?.slots).toHaveLength(6);
    // Waitlist now has just W2, renumbered to position 1
    expect(after.waitlist).toHaveLength(1);
    expect(after.waitlist[0]?.id).toBe(wl[1]?.id);
    expect(after.waitlist[0]?.position).toBe(1);
  });
});
