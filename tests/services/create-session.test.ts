import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { courts, events, slots } from '@/lib/db/schema';
import { ServiceError } from '@/lib/errors';
import { createSession } from '@/lib/services';
import { closeAll, resetDb, TEST_CREATOR_DEVICE } from '../_helpers';

describe('createSession', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('inserts session + 1 court + create_session event; no slots', async () => {
    const startsAt = Date.now() + 3600_000;
    const endsAt = startsAt + 7200_000;
    const view = await createSession(getDb(), {
      startsAt,
      endsAt,
      venue: 'Shuttl',
      creatorDeviceId: TEST_CREATOR_DEVICE,
    });

    expect(typeof view.id).toBe('string');
    expect(view.id).toHaveLength(4);
    expect(view.creatorDeviceId).toBe(TEST_CREATOR_DEVICE);
    expect(view.creatorCode.startsWith(`${view.id}-`)).toBe(true);

    expect(view.courts).toHaveLength(1);
    expect(view.courts[0]?.label).toBe('Court 1');
    expect(view.courts[0]?.capacity).toBe(6);
    expect(view.courts[0]?.position).toBe(1);
    expect(view.courts[0]?.slots).toHaveLength(0);

    expect(view.waitlist).toHaveLength(0);

    const db = getDb();
    const courtRows = await db.select().from(courts).where(eq(courts.sessionId, view.id));
    expect(courtRows).toHaveLength(1);

    const slotRows = await db.select().from(slots).where(eq(slots.sessionId, view.id));
    expect(slotRows).toHaveLength(0);

    const eventRows = await db.select().from(events).where(eq(events.sessionId, view.id));
    expect(eventRows.some((e) => e.action === 'create_session')).toBe(true);
  });

  it('respects initialCapacity within 4..6', async () => {
    const startsAt = Date.now() + 3600_000;
    const view = await createSession(getDb(), {
      startsAt,
      endsAt: startsAt + 7200_000,
      venue: 'Shuttl',
      creatorDeviceId: TEST_CREATOR_DEVICE,
      initialCapacity: 4,
    });
    expect(view.courts[0]?.capacity).toBe(4);
  });

  it('rejects endsAt <= startsAt', async () => {
    const startsAt = Date.now() + 3600_000;
    await expect(
      createSession(getDb(), {
        startsAt,
        endsAt: startsAt,
        venue: 'Shuttl',
        creatorDeviceId: TEST_CREATOR_DEVICE,
      }),
    ).rejects.toThrow(ServiceError);
  });

  it('rejects unknown venue', async () => {
    const startsAt = Date.now() + 3600_000;
    await expect(
      createSession(getDb(), {
        startsAt,
        endsAt: startsAt + 7200_000,
        venue: 'NotAVenue',
        creatorDeviceId: TEST_CREATOR_DEVICE,
      }),
    ).rejects.toThrow(ServiceError);
  });

  it('requires venueCustom when venue is Other', async () => {
    const startsAt = Date.now() + 3600_000;
    await expect(
      createSession(getDb(), {
        startsAt,
        endsAt: startsAt + 7200_000,
        venue: 'Other',
        creatorDeviceId: TEST_CREATOR_DEVICE,
      }),
    ).rejects.toThrow(ServiceError);
  });
});
