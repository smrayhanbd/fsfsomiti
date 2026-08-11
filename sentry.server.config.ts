/**
 * Sentry Node-runtime configuration.
 *
 * Loaded automatically by `@sentry/nextjs` for the Node.js runtime
 * (Server Components, Server Actions, Route Handlers,`next start`).
 *
 * See {@link sentry.client.config.ts} for the graceful-fallback strategy —
 * the same applies here. The only difference is the API surface: the Node
 * runtime has no `replays*` options (no DOM). Sentry v10 captures unhandled
 * rejections and uncaught exceptions automatically by default, so the
 * explicit `onUnhandledRejection` / `onUncaughtException` hooks that
 * existed in v7/v8 have been removed from `CoreOptions`.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release:
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    // Unhandled rejections / uncaught exceptions are captured automatically
    // by Sentry v10's Node integration. The previous `onUnhandledRejection`
    // callback (which only logged to console) is no longer needed and has
    // been removed from `CoreOptions`.
  })
}
