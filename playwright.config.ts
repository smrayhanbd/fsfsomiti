import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright E2E config.
 *
 * Smoke scope for now — just `tests/e2e/smoke.spec.ts` hitting `/` and
 * `/login`. The full e2e suite (auth flow, dashboard, transactions) will
 * land in a later phase; this file just bootstraps the runner + the dev
 * server command so `npm run test:e2e` works out of the box.
 *
 * The dev server is started by Playwright via `webServer` — this avoids the
 * classic "did I forget to start `npm run dev`?" trap. We don't pre-build
 * the app because `next build` takes 60+ seconds and the dev server is
 * fine for smoke tests.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Generous timeout — Next.js dev server is slow on cold starts.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Don't fail if the dev server logs warnings (React dev-mode noise).
    stdout: "ignore",
    stderr: "pipe",
  },
})
