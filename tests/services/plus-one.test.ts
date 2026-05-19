import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { addPlusOne, joinSession } from '@/lib/services';
import { closeAll, resetDb, seedSession } from '../_helpers';

describe('addPlusOne', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('rejects empty name', async () => {
    const session = await seedSession();
    const owner = await joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-alice',
      displayName: 'Alice',
    });
    try {
      await addPlusOne(getDb(), {
        sessionId: session.id,
        ownerSlotId: owner.id,
        requesterDeviceId: 'device-alice',
        plusOneName: '   ',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('validation_failed');
    }
  });

  it('with a name: creates a new slot with isPlusOne true that takes capacity', async () => {
    const session = await seedSession({ initialCapacity: 6 });
    const court = session.courts[0]!;
    const owner = await joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-alice',
      displayName: 'Alice',
    });

    const plusOne = await addPlusOne(getDb(), {
      sessionId: session.id,
      ownerSlotId: owner.id,
      requesterDeviceId: 'device-alice',
      plusOneName: 'Bob',
    });
    expect(plusOne.isPlusOne).toBe(true);
    expect(plusOne.displayName).toBe('Bob');
    expect(plusOne.plusOneOf).toBe(owner.id);
    expect(plusOne.state).toBe('confirmed');
    expect(plusOne.courtId).toBe(court.id);

    // Filling: Alice + Bob = 2 of 6. Add 4 more solos, the 7th attempt should
    // hit the waitlist (because +1 took a real capacity slot).
    for (let i = 0; i < 4; i++) {
      const s = await joinSession(getDb(), {
        sessionId: session.id,
        deviceId: `device-fill-${i}`,
        displayName: `Fill ${i}`,
      });
      expect(s.state).toBe('confirmed');
    }

    const overflow = await joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-overflow',
      displayName: 'Overflow',
    });
    expect(overflow.state).toBe('waitlist');
  });

  it('only the slot owner can add a +1 to it', async () => {
    const session = await seedSession();
    const owner = await joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-alice',
      displayName: 'Alice',
    });
    try {
      await addPlusOne(getDb(), {
        sessionId: session.id,
        ownerSlotId: owner.id,
        requesterDeviceId: 'device-someone-else',
        plusOneName: 'Bob',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('unauthorized');
    }
  });
});
