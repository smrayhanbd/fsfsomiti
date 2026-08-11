/**
 * Sentry browser-runtime configuration.
 *
 * Loaded automatically by `@sentry/nextjs` for client bundles. We deliberately
 * keep this in TypeScript (not the older `sentry.client.config.js` form) —
 * Next.js 16 picks up the `.ts` extension natively.
 *
 * Graceful fallback: when `SENTRY_DSN` is unset (e.g. local dev, CI, or a
 * fresh deploy without Sentry configured), we skip `Sentry.init()` entirely.
 * The SDK becomes a no-op, so any `Sentry.captureException()` calls scattered
 * through the app degrade to console warnings without throwing.
 *
 * Set `SENTRY_DSN` to enable. Optional: `SENTRY_ENVIRONMENT`,
 * `SENTRY_RELEASE` (defaults to the Vercel git SHA), `SENTRY_TRACES_SAMPLE_RATE`.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release:
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      undefined,
    // 1% of transactions sampled for performance — keeps quota usage low.
    // Bump to 0.1 in prod once traffic grows; cap at 1.0 for staging.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.01),
    // Browser-side session replay is opt-in to avoid capturing PII.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Suppress the noisy dev-mode "Sentry is disabled" banner.
    enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_ENABLE_IN_DEV === "1",
  })
}
