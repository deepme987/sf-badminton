/**
 * Past-session behavior. A session whose `endsAt` is in the past should be
 * fully visible (so members can scroll back through what happened), but every
 * mutating affordance — Join, +1, Drop, Add court, Edit, Delete — has to be
 * hidden so nothing can be changed after the fact.
 *
 * We pre-stage a session in the past via the API (the create endpoint accepts
 * any `startsAt`/`endsAt` pair, including past), then drive both the session
 * page and the history page from real browser contexts.
 */

import { test, expect } from '@playwright/test';
import {
  apiCreateSession,
  apiDeleteSession,
  apiJoin,
  newDeviceId,
  sessionUrl,
  setIdentity,
  type CreatedSession,
} from './_helpers';

const HOUR = 60 * 60 * 1000;

async function createPastSession(): Promise<CreatedSession> {
  // Session that started 2 days ago and ended 2 days ago - 1.5h.
  const endsAt = Date.now() - 2 * 24 * HOUR;
  const startsAt = endsAt - 90 * 60 * 1000;
  return apiCreateSession({ startsAt, endsAt });
}

test.describe.configure({ mode: 'serial' });

test.describe('Past sessions', () => {
  let pastSession: CreatedSession;

  test.beforeAll(async () => {
    pastSession = await createPastSession();
    // Pre-populate with a joiner from a different device so we exercise the
    // "I can see who else went" path.
    await apiJoin(pastSession.id, 'EarlyAttendee');
  });

  test.afterAll(async () => {
    if (pastSession) {
      await apiDeleteSession(pastSession.id, pastSession.deviceId).catch(() => {});
    }
  });

  test('past session is viewable — roster + audit log render', async ({ page }) => {
    await setIdentity(page, { id: newDeviceId(), name: 'NewViewer' });
    await page.goto(sessionUrl(pastSession.id));

    // The previously-joined player should be in the roster.
    await expect(page.getByTitle('EarlyAttendee')).toBeVisible();

    // Activity log includes the create_session event ("Session created by …").
    // We seeded without a creatorDisplayName, so the bare "Session created"
    // copy is what renders.
    await expect(page.getByText(/Session created/).first()).toBeVisible();
  });

  test('past session hides all mutating actions for a viewer', async ({ page }) => {
    await setIdentity(page, { id: newDeviceId(), name: 'NewViewer2' });
    await page.goto(sessionUrl(pastSession.id));

    // "I'm in" must not be offered.
    await expect(page.getByRole('button', { name: "I'm in" })).toHaveCount(0);
    // Neither should +1 / Drop / Add court.
    await expect(page.getByRole('button', { name: /Add a \+1/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Drop$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add court/ })).toHaveCount(0);
  });

  test('past session hides mutating actions for the creator too', async ({ page }) => {
    // Land as the original creator.
    await setIdentity(page, { id: pastSession.deviceId, name: 'Lead' });
    await page.goto(sessionUrl(pastSession.id));

    // Even the creator can't change a past session.
    await expect(page.getByRole('button', { name: "I'm in" })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add a \+1/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add court/ })).toHaveCount(0);

    // Per-slot inline Drop buttons should also be gone — read-only roster.
    await expect(page.getByRole('button', { name: /^Drop EarlyAttendee$/ })).toHaveCount(0);
  });

  test('history page lists the past session', async ({ page }) => {
    await setIdentity(page, { id: newDeviceId(), name: 'HistoryViewer' });
    await page.goto('/history');

    // The session card should appear under Past on /history. The card links
    // by id; we just confirm there's at least one link matching our slug.
    await expect(page.locator(`a[href="/sessions/${pastSession.id}"]`)).toHaveCount(1);
  });
});
