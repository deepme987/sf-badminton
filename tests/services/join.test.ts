import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { joinSession } from '@/lib/services';
import { closeAll, joinN, resetDb, seedSession } from '../_helpers';

describe('joinSession (capacity 6, single court)', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('first 6 joiners fill court 1; 7th lands on waitlist position 1', async () => {
    const session = await seedSession();
    const court = session.courts[0];
    expect(court).toBeDefined();

    const confirmed = await joinN(session.id, 6, 'P');
    expect(confirmed).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const s = confirmed[i];
      expect(s?.state).toBe('confirmed');
      expect(s?.courtId).toBe(court?.id);
      expect(s?.position).toBe(i + 1);
    }

    const seventh = await joinSession(getDb(), {
      sessionId: session.id,
      deviceId: 'device-overflow-7',
      displayName: 'Seventh',
    });
    expect(seventh.state).toBe('waitlist');
    expect(seventh.courtId).toBeNull();
    expect(seventh.position).toBe(1);
  });

  it('rejects empty displayName', async () => {
    const session = await seedSession();
    await expect(
      joinSession(getDb(), {
        sessionId: session.id,
        deviceId: 'device-x',
        displayName: '   ',
      }),
    ).rejects.toThrow(/displayName/);
  });
});
