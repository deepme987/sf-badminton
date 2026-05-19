import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/sessions/route';
import { closeAll, resetDb, TEST_CREATOR_DEVICE } from '../_helpers';

describe('POST /api/sessions', () => {
  beforeEach(resetDb);
  afterAll(closeAll);

  it('creates a session and returns 201 with a slug id', async () => {
    const startsAt = Date.now() + 3600_000;
    const endsAt = startsAt + 7200_000;
    const req = new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-id': TEST_CREATOR_DEVICE,
      },
      body: JSON.stringify({
        startsAt,
        endsAt,
        venue: 'Shuttl',
        initialCapacity: 6,
      }),
    });
    // The Next.js route handler accepts a NextRequest, which is a subclass of
    // the standard `Request`. A plain `Request` is structurally compatible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const data = (await res.json()) as { id: string; courts: unknown[] };
    expect(typeof data.id).toBe('string');
    expect(data.id.length).toBeGreaterThan(0);
    expect(Array.isArray(data.courts)).toBe(true);
    expect(data.courts).toHaveLength(1);
  });

  it('rejects requests without X-Device-Id', async () => {
    const startsAt = Date.now() + 3600_000;
    const req = new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startsAt,
        endsAt: startsAt + 7200_000,
        venue: 'Shuttl',
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe('validation_failed');
  });
});
