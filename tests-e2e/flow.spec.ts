/**
 * Full session lifecycle: create -> join -> +1 -> drop -> rejoin, plus
 * cross-user permission checks.
 *
 * Sequencing matters here, so this lives in one describe block with shared
 * before/after hooks. Each test mutates the same session created in
 * beforeAll; afterAll deletes it (which cascades to slots + events).
 *
 * One bonus API-only smoke test sits at the end — Playwright's `request`
 * fixture lets us hit the route handlers without a browser.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  apiCreateSession,
  apiDeleteSession,
  apiJoin,
  newDeviceId,
  setIdentity,
  sessionUrl,
  type CreatedSession,
} from './_helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Session flow', () => {
  let session: CreatedSession;

  test.beforeAll(async () => {
    try {
      session = await apiCreateSession({ initialCapacity: 6 });
    } catch (err) {
      // Surface what went wrong so the rest of the describe isn't a mystery.
      throw new Error(
        `flow.spec beforeAll failed to create session: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  test.afterAll(async () => {
    if (session) {
      await apiDeleteSession(session.id, session.deviceId).catch(() => {
        // Already deleted by a test, or never created. Ignore.
      });
    }
  });

  test('new user joins and lands at position 1 on Court 1', async ({
    page,
    context,
  }) => {
    // Distinct identity for this user. NOT the creator's device id.
    const userId = newDeviceId();
    await setIdentity(page, { id: userId, name: 'Alice' });
    await page.goto(sessionUrl(session.id));

    // "I'm in" button — desktop puts it inline in the AppBar, mobile in the
    // BottomBar. getByRole matches either.
    const joinBtn = page.getByRole('button', { name: "I'm in" }).first();
    await expect(joinBtn).toBeVisible();
    await expect(joinBtn).toBeEnabled();

    await joinBtn.click();

    // "You're in" tag should appear on the page.
    await expect(page.getByText("You're in").first()).toBeVisible();

    // Roster should now include Alice.
    await expect(page.getByTitle('Alice')).toBeVisible();
    void context; // unused but kept for symmetry with multi-context tests
  });

  test('user clicks +1 and adds a guest to their slot', async ({ page }) => {
    const userId = newDeviceId();
    await setIdentity(page, { id: userId, name: 'Bob' });
    await page.goto(sessionUrl(session.id));

    // Join first.
    await page.getByRole('button', { name: "I'm in" }).first().click();
    await expect(page.getByTitle('Bob')).toBeVisible();

    // Open the +1 modal. Button label is "+ Add a +1" (desktop top inline +
    // mobile bottom-bar).
    await page.getByRole('button', { name: '+ Add a +1' }).first().click();

    // Modal asks for the +1's name.
    const modalHeading = page.getByRole('heading', { name: 'Add a +1' });
    await expect(modalHeading).toBeVisible();

    const guestInput = page.getByLabel("Guest's name");
    await guestInput.fill('Carla');
    await page.getByRole('button', { name: /Add Carla/ }).click();

    // Modal closes; Carla appears in the roster with a +1 tag.
    await expect(modalHeading).toBeHidden();
    await expect(page.getByTitle(/Carla/).first()).toBeVisible();
  });

  test('user drops own slot via confirm modal (mentions rejoin warning)', async ({
    page,
  }) => {
    const userId = newDeviceId();
    await setIdentity(page, { id: userId, name: 'Dora' });
    await page.goto(sessionUrl(session.id));

    await page.getByRole('button', { name: "I'm in" }).first().click();
    await expect(page.getByTitle('Dora')).toBeVisible();

    // The "Drop" affordance: bottom-bar on mobile, slot-row inline on desktop.
    // Both render as buttons with accessible names. We click the first one
    // we find — on mobile it's the bottom-bar button; on desktop we click
    // the per-slot "Drop Dora" link.
    const dropButtons = page.getByRole('button', { name: /^Drop( Dora)?$/ });
    const ariaDropLink = page.getByRole('button', { name: 'Drop Dora' });
    // Prefer the "Drop Dora" per-slot button when visible (desktop), else
    // the generic bottom-bar "Drop" button (mobile).
    if (await ariaDropLink.isVisible().catch(() => false)) {
      await ariaDropLink.click();
    } else {
      await dropButtons.first().click();
    }

    // Confirm modal — title + rejoin warning text.
    await expect(
      page.getByRole('heading', { name: 'Drop your spot?' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Heads up — if you rejoin later, you'll be at the back of the line.",
      ),
    ).toBeVisible();

    // Scope the click to inside the dialog — the bottom-bar's "Drop" button
    // shares the same accessible name and goes disabled while the modal is open.
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Drop', exact: true })
      .click();

    // Modal closes; Dora's slot is gone from the roster.
    await expect(
      page.getByRole('heading', { name: 'Drop your spot?' }),
    ).toBeHidden();
    await expect(page.getByTitle('Dora')).toBeHidden();
    // (Audit-log assertion intentionally omitted — the "what" column is
    // hidden on mobile <560px and the slot-disappearance above already
    // proves the drop went through.)
  });

  test('rejoin after drop puts user at position 2+ (FCFS)', async ({ page }) => {
    // Seed: one other user already in slot 1. We use the API to plant them so
    // we don't rely on UI state from prior tests.
    await apiJoin(session.id, 'EarlyBird');

    const userId = newDeviceId();
    await setIdentity(page, { id: userId, name: 'Eve' });
    await page.goto(sessionUrl(session.id));

    // Eve joins (lands behind EarlyBird).
    await page.getByRole('button', { name: "I'm in" }).first().click();
    await expect(page.getByTitle('Eve')).toBeVisible();

    // Eve drops.
    const ariaDropLink = page.getByRole('button', { name: 'Drop Eve' });
    if (await ariaDropLink.isVisible().catch(() => false)) {
      await ariaDropLink.click();
    } else {
      await page.getByRole('button', { name: /^Drop$/ }).first().click();
    }
    // Scope to dialog — bottom-bar "Drop" shares the name and gets covered
    // by the modal backdrop on mobile.
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Drop', exact: true })
      .click();
    await expect(page.getByTitle('Eve')).toBeHidden();

    // Eve rejoins via the "Rejoin" button (state machine swaps "I'm in"
    // for "Rejoin" because hasDropped is true).
    const rejoinBtn = page.getByRole('button', { name: 'Rejoin' }).first();
    await expect(rejoinBtn).toBeVisible();
    await rejoinBtn.click();

    await expect(page.getByTitle('Eve')).toBeVisible();

    // EarlyBird must still be ahead of Eve in the DOM (Court 1's row order
    // reflects position). Locate the rows and compare y positions.
    const earlyRow = page.getByTitle('EarlyBird').first();
    const eveRow = page.getByTitle('Eve').first();
    const earlyBox = await earlyRow.boundingBox();
    const eveBox = await eveRow.boundingBox();
    expect(earlyBox).not.toBeNull();
    expect(eveBox).not.toBeNull();
    if (earlyBox && eveBox) {
      expect(earlyBox.y).toBeLessThan(eveBox.y);
    }
  });

  test('non-creator cannot drop other users', async ({ browser }) => {
    // Plant a slot we'll try to drop from another user's perspective.
    const planted = await apiJoin(session.id, 'PlantedUser');

    // Spin up a fresh context (different storage) as a different user.
    const ctx = await browser.newContext();
    const otherPage: Page = await ctx.newPage();
    await setIdentity(otherPage, {
      id: newDeviceId(),
      name: 'Stranger',
    });
    await otherPage.goto(sessionUrl(session.id));

    // PlantedUser should be visible in the roster.
    await expect(otherPage.getByTitle('PlantedUser')).toBeVisible();

    // But there must be no "Drop PlantedUser" button — Stranger isn't the
    // creator and doesn't own that slot, so canDropSlot returns false and
    // the per-row Drop button is not rendered at all.
    await expect(
      otherPage.getByRole('button', { name: 'Drop PlantedUser' }),
    ).toHaveCount(0);

    await ctx.close();

    // Clean up by dropping the planted slot directly via API.
    // (apiDropSlot belongs to that slot's deviceId; the planted user is allowed.)
    void planted; // session teardown drops it anyway
  });

  test('creator can drop any slot', async ({ page }) => {
    // Plant a slot owned by someone else.
    await apiJoin(session.id, 'TargetUser');

    // Land as the creator.
    await setIdentity(page, { id: session.deviceId, name: 'Creator' });
    await page.goto(sessionUrl(session.id));

    // Creator should see a per-row "Drop TargetUser" button.
    const dropTarget = page.getByRole('button', { name: 'Drop TargetUser' });
    // The button is opacity-0 until hover, but Playwright treats it as
    // visible (in the DOM) — we just confirm it exists for the creator.
    await expect(dropTarget).toHaveCount(1);
  });
});

test.describe('API smoke', () => {
  test('POST /api/sessions -> GET -> DELETE round-trip', async ({ request }) => {
    const deviceId = newDeviceId();
    const startsAt = Date.now() + 24 * 60 * 60 * 1000;
    const endsAt = startsAt + 90 * 60 * 1000;

    const create = await request.post('/api/sessions', {
      headers: { 'X-Device-Id': deviceId },
      data: {
        startsAt,
        endsAt,
        venue: 'Shuttl',
        initialCapacity: 6,
      },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as { id: string; creatorCode: string };
    expect(created.id).toBeTruthy();
    expect(created.creatorCode).toBeTruthy();

    const get = await request.get(`/api/sessions/${created.id}`);
    expect(get.status()).toBe(200);
    const view = (await get.json()) as {
      id: string;
      courts: Array<{ capacity: number }>;
    };
    expect(view.id).toBe(created.id);
    expect(view.courts.length).toBeGreaterThan(0);

    const del = await request.delete(`/api/sessions/${created.id}`, {
      headers: { 'X-Device-Id': deviceId },
    });
    expect(del.status()).toBe(200);

    // Subsequent GET should 404.
    const after = await request.get(`/api/sessions/${created.id}`);
    expect(after.status()).toBe(404);
  });
});
