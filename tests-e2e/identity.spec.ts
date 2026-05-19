/**
 * Identity onboarding + persistence.
 *
 * The app's whole identity model is one localStorage key (`vibe.identity`)
 * with `{ deviceId, displayName }`. These tests cover the three lifecycle
 * states: first-visit, returning, renamed-in-profile.
 */

import { test, expect } from '@playwright/test';
import { setIdentity, seedIdentityOnce, newDeviceId } from './_helpers';

test.describe('Identity', () => {
  test('first visit renders onboarding and persists identity to localStorage', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    // Onboarding card title.
    await expect(page.getByRole('heading', { name: 'Welcome.' })).toBeVisible();

    const nameInput = page.getByLabel('Your name');
    await nameInput.fill('Megha');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Card should be gone now.
    await expect(
      page.getByRole('heading', { name: 'Welcome.' }),
    ).toBeHidden();

    const raw = await page.evaluate(() =>
      window.localStorage.getItem('vibe.identity'),
    );
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      deviceId: string;
      displayName: string;
    };
    expect(parsed.displayName).toBe('Megha');
    // deviceId looks like a UUID (8-4-4-4-12 hex characters).
    expect(parsed.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test('returning visit skips the onboarding card', async ({ page }) => {
    await setIdentity(page, { id: newDeviceId(), name: 'Returner' });
    await page.goto('/');

    // The Welcome onboarding card should NOT render.
    await expect(
      page.getByRole('heading', { name: 'Welcome.' }),
    ).toBeHidden();

    // Onboarding's labeled input shouldn't either.
    await expect(page.getByLabel('Your name')).toBeHidden();
  });

  test('profile rename persists across reload', async ({ page }) => {
    const id = newDeviceId();
    // Use the single-shot helper so the in-app rename isn't overwritten on reload.
    await seedIdentityOnce(page, { id, name: 'Before' });
    await page.goto('/profile');

    const nameInput = page.getByLabel('Your name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('Before');

    await nameInput.fill('After');
    // Trigger the blur handler that persists the change.
    await nameInput.blur();

    // Verify localStorage reflects the new value.
    await expect
      .poll(async () => {
        const raw = await page.evaluate(() =>
          window.localStorage.getItem('vibe.identity'),
        );
        if (!raw) return null;
        return (JSON.parse(raw) as { displayName: string }).displayName;
      })
      .toBe('After');

    await page.reload();
    await expect(page.getByLabel('Your name')).toHaveValue('After');
  });
});
