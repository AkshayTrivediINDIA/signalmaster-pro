import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration for the critical user journeys.
 *
 * Playwright is an optional dev dependency (`npm i -D @playwright/test` plus
 * `npx playwright install chromium`). The suite is documented in
 * docs/testing.md; it is not part of the default `npm test` run because it
 * needs browser binaries that are large to download.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Set PW_CHROMIUM to reuse a Chromium build that Playwright did not install
    // itself (useful in CI images that preinstall the browser).
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 90_000,
      },
});
