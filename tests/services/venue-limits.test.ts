import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { addCourt } from '@/lib/services';
import { closeAll, resetDb, seedSession, TEST_CREATOR_DEVICE } from '../_helpers';

describe('venue max-courts limits', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('OneA: adding a second court is a conflict (max 1)', async () => {
    const session = await seedSession({ venue: 'OneA' });
    expect(session.courts).toHaveLength(1);
    try {
      await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('conflict');
    }
  });

  it('Shuttl: 5th addCourt is a conflict (max 4)', async () => {
    const session = await seedSession({ venue: 'Shuttl' });
    // Already has 1 court from create. Add 3 more (total 4).
    for (let i = 0; i < 3; i++) {
      await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
    }
    // 5th add should conflict
    try {
      await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('conflict');
    }
  });

  it('Other: arbitrary addCourt is ok (no cap)', async () => {
    const session = await seedSession({ venue: 'Other', venueCustom: 'Some Hall' });
    // Add several courts, none should conflict
    for (let i = 0; i < 5; i++) {
      const view = await addCourt(getDb(), session.id, TEST_CREATOR_DEVICE, 6);
      expect(view.courts).toHaveLength(2 + i);
    }
  });
});
