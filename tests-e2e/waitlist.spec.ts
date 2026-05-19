/**
 * Waitlist + auto-promotion.
 *
 * 7 users join a 6-cap session; the 7th lands on the waitlist. Drop one of
 * the confirmed, reload the 7th's view, and assert auto-promotion.
 *
 * Each user is a separate browser context (own localStorage / own device id)
 * so the join calls hit distinct identities. We use the API helper for joins
 * to keep the test focused on the promotion behavior; only the 7th user
 * loads the UI to verify the promoted banner.
 */

import { test, expect } from '@playwright/test';
import {
  apiCreateSession,
  apiDeleteSession,
  apiDropSlot,
  apiJoin,
  newDeviceId,
  setIdentity,
  sessionUrl,
  type CreatedSession,
  type JoinedSlot,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Waitlist', () => {
  let session: CreatedSession;
  let joiners: Array<JoinedSlot & { name: string }>;

  test.beforeAll(async () => {
    try {
      session = await apiCreateSession({ initialCapacity: 6 });
      joiners = [];
      for (let i = 1; i <= 7; i++) {
        const name = `User${i}`;
        const slot = await apiJoin(session.id, name);
        joiners.push({ ...slot, name });
      }
    } catch (err) {
      // Bail loudly; afterAll still runs to attempt cleanup if a session was
      // actually created.
      throw new Error(
        `waitlist beforeAll failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  test.afterAll(async () => {
    if (session) {
      await apiDeleteSession(session.id, session.deviceId).catch(() => {
        // ignore
      });
    }
  });

  test('first 6 land confirmed; 7th lands on waitlist', async () => {
    expect(joiners).toHaveLength(7);
    for (let i = 0; i < 6; i++) {
      const j = joiners[i];
      expect(j, `joiner ${i + 1} missing`).toBeDefined();
      if (!j) continue;
      expect(j.state, `joiner ${i + 1} state`).toBe('confirmed');
      expect(j.courtId, `joiner ${i + 1} courtId`).not.toBeNull();
    }
    const seventh = joiners[6];
    expect(seventh).toBeDefined();
    if (!seventh) return;
    expect(seventh.state).toBe('waitlist');
    expect(seventh.courtId).toBeNull();
  });

  test('drop position 3 auto-promotes the 7th joiner', async ({
    page,
  }) => {
    const promoted = joiners[6]!; // the original waitlist user
    const dropped = joiners[2]!; // position 3 in Court 1

    // Drop one confirmed slot using that user's deviceId.
    await apiDropSlot(dropped.slotId, dropped.deviceId);

    // Load the page as the promoted (formerly-waitlisted) user. Their
    // identity is the one we stamped during apiJoin.
    await setIdentity(page, { id: promoted.deviceId, name: promoted.name });
    await page.goto(sessionUrl(session.id));

    // Their slot should now appear in a court (not the waitlist). The
    // promoted user's name should render with a "You're in" tag somewhere
    // on the page.
    await expect(
      page.getByText("You're in", { exact: false }).first(),
    ).toBeVisible();

    // The waitlist section may still render with header "Waitlist", but
    // User7 should NOT appear under a W-position. Check that User7 is in
    // a court row by confirming its row sits above the Waitlist heading,
    // OR (more robust) that the waitlist section is gone entirely (since
    // we only had 1 waiter before).
    const waitlistHeading = page.getByRole('heading', { name: 'Waitlist' });
    await expect(waitlistHeading).toHaveCount(0);

    // And the promoted user's name is visible in the roster.
    await expect(page.getByTitle(promoted.name).first()).toBeVisible();
  });
});
