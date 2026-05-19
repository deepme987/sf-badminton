import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for SF-Badminton smoke + critical-flow e2e tests.
 *
 * Tests share a single Supabase Postgres project, so we run sequentially to
 * avoid cross-test interference (`fullyParallel: false`, `workers: 1`).
 *
 * The `webServer` block makes `npm run test:e2e` fully self-contained: if the
 * dev server isn't already running, Playwright will start it. If it IS running
 * (the common local case), `reuseExistingServer` keeps it.
 */
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: './playwright-report',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
