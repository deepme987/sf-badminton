/**
 * App chrome tests: top app bar, bottom bar, theme toggle.
 *
 * These run on both `chromium` (desktop) and `mobile-chrome` (Pixel 7)
 * projects. Tests gate on viewport so the desktop-only inline "New session"
 * CTA only runs on desktop, and the bottom-bar tests only run on mobile.
 */

import { test, expect } from '@playwright/test';
import { setIdentity, newDeviceId } from './_helpers';

test.describe('App chrome', () => {
  test.beforeEach(async ({ page }) => {
    // Seed an identity so we land on the populated home, not the onboarding
    // card. Identity-onboarding flow is covered in identity.spec.ts.
    await setIdentity(page, { id: newDeviceId(), name: 'ChromeTester' });
    await page.goto('/');
  });

  test('top app bar shows SFB wordmark', async ({ page }) => {
    const appBar = page.locator('[data-app-bar]');
    await expect(appBar).toBeVisible();
    await expect(appBar.getByText('SFB', { exact: true })).toBeVisible();
  });

  // Note: theme toggle was removed from the AppBar per user feedback. The
  // canonical control is now the 3-way picker in /profile (Light/Dark/System).
  // Tests for that picker live in identity.spec.ts.

  test('profile icon is a 44x44 tap target', async ({ page }) => {
    const profile = page
      .locator('[data-app-bar]')
      .getByRole('link', { name: /Profile/ });
    await expect(profile).toBeVisible();
    const box = await profile.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('inline "+ New session" CTA visibility flips with viewport', async ({
    page,
    viewport,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile-chrome';
    const inlineCta = page
      .locator('[data-app-bar]')
      .getByRole('link', { name: 'Create a new session' });

    if (isMobile) {
      // Regression: on mobile, the inline CTA must be hidden (the BottomBar
      // owns the "+ New session" affordance there).
      await expect(inlineCta).toBeHidden();
    } else {
      // Desktop: the inline CTA must be visible.
      await expect(inlineCta).toBeVisible();
      // Sanity check that the viewport is actually wide enough for md+.
      expect((viewport?.width ?? 0) >= 768).toBeTruthy();
    }
  });

  test('bottom bar visibility flips with viewport', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile-chrome';
    const bottomBar = page.locator('[data-bottom-bar]');

    if (isMobile) {
      await expect(bottomBar).toBeVisible();
      // The bottom-bar primary CTA should be "New session" on the home page.
      await expect(
        bottomBar.getByRole('link', { name: /^New session$/ }),
      ).toBeVisible();
    } else {
      // On desktop the bottom bar is `md:hidden`.
      await expect(bottomBar).toBeHidden();
    }
  });

  test('theme picker on /profile flips html[data-theme] + persists', async ({ page }) => {
    // Force light starting state.
    await page.evaluate(() => {
      window.localStorage.setItem('vibe.theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.goto('/profile');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Click "Dark" in the appearance segmented control.
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Persist across reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Back to light + persist.
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
