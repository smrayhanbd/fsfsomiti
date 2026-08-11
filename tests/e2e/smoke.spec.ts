import { test, expect } from "@playwright/test"

/**
 * Smoke tests — just enough to verify the app boots and serves the
 * unauthenticated routes. Full e2e (auth flow, dashboard, transactions)
 * lands in a later phase.
 *
 * The dev server is started by Playwright automatically (see
 * playwright.config.ts `webServer`); CI runs against a preview build.
 */

test("homepage loads and renders the brand hero", async ({ page }) => {
  const res = await page.goto("/")
  expect(res?.status()).toBe(200)
  // The landing page renders an H1 — the exact text depends on the
  // Organization row, so we just check that SOMETHING rendered.
  await expect(page.locator("h1").first()).toBeVisible()
})

test("login page renders the sign-in form", async ({ page }) => {
  const res = await page.goto("/login")
  expect(res?.status()).toBe(200)
  // The login form has an email and password input — the most basic
  // "did the page actually render?" check.
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('input[name="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test("unknown route returns the branded 404 page", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist")
  // Next.js serves a 404 status + our not-found.tsx UI.
  expect(res?.status()).toBe(404)
  await expect(page.getByText(/Page not found/i)).toBeVisible()
})

test("health endpoint returns 200 with the expected payload shape", async ({
  request,
}) => {
  const res = await request.get("/api/health")
  // The health endpoint returns 200 if the DB is reachable, 503 if not.
  // In local dev without a DB, this will be 503 — accept either.
  expect([200, 503]).toContain(res.status())
  const body = await res.json()
  expect(body).toHaveProperty("ok")
  expect(body).toHaveProperty("time")
  expect(body).toHaveProperty("version")
  expect(typeof body.ok).toBe("boolean")
})
