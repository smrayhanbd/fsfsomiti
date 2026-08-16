/**
 * Inngest scheduled (cron-triggered) functions — the project's sole scheduler.
 *
 * All 5 cron jobs run via Inngest:
 *   - scheduled-backup          (daily 02:00 UTC)
 *   - scheduled-late-fee        (daily 01:00 UTC)
 *   - scheduled-npl-scan        (daily 06:00 UTC)
 *   - scheduled-maturity-scan   (daily 08:00 UTC)
 *   - scheduled-message-retry   (every 5 minutes)
 *
 * Why Inngest (not Vercel Cron or GitHub Actions):
 *   - Vercel Hobby caps Cron at 2 daily jobs; no sub-daily schedules.
 *   - Inngest's free tier (5,000 runs/month) has no such limit.
 *   - Automatic retries on transient failures (DB blips, gateway timeouts).
 *   - Per-function concurrency limits (a slow daily run can't overlap
 *     with the next day's fire).
 *   - Dashboard with run history, logs, and retry controls.
 *
 * Setup (one-time, after deploying to Vercel):
 *   1. Sign up at https://www.inngest.com (free, no credit card)
 *   2. Create an app → copy the Event Key + Signing Key
 *   3. Add to Vercel env vars:
 *        INNGEST_EVENT_KEY=...
 *        INNGEST_SIGNING_KEY=...
 *   4. In the Inngest dashboard, add your app URL:
 *        https://YOUR-DEPLOYMENT.vercel.app/api/inngest
 *   5. Redeploy. Inngest will sync all 5 scheduled functions and begin
 *      firing them on the schedules declared below.
 *
 * Local dev:
 *   - Without INNGEST_EVENT_KEY set, these functions are NOT registered.
 *     Use `npx inngest-cli@latest dev` to run the Inngest dev server,
 *     which detects your Next.js app and fires the schedules locally.
 *
 * The route handlers at /api/{backup/run,loans/late-fee,loans/npl-scan,
 * deposits/maturity-scan,messages/retry} still exist for manual admin
 * triggers via the dashboard. They share the same business logic as
 * these Inngest functions (extracted into lib/ modules) so behaviour
 * is identical regardless of which caller fires the work.
 *
 * Server-only.
 */
import { inngest } from "@/lib/inngest/client"
import { logger } from "@/lib/logger"

// ─────────────────────────────────────────────────────────────────────────
// Daily backup — 02:00 UTC
// ─────────────────────────────────────────────────────────────────────────
export const scheduledBackup = inngest?.createFunction(
  {
    id: "scheduled-backup",
    name: "Daily DB Backup",
    // Concurrency 1 — never run two backups in parallel (would write
    // duplicate S3 objects + duplicate Backup rows).
    concurrency: 1,
    // Retry 3x with exponential backoff on transient failures (DB blip,
    // S3 timeout). Each step is independently retried.
    retries: 3,
  },
  { cron: "0 2 * * *" }, // 02:00 UTC daily
  async ({ step }) => {
    const result = await step.run("run-backup", async () => {
      const { runScheduledBackup } = await import("@/lib/backup/scheduledBackup")
      return runScheduledBackup("inngest")
    })
    logger.info({ result }, "[inngest] scheduled backup complete")
    return result
  }
)

// ─────────────────────────────────────────────────────────────────────────
// Daily late-fee accrual — 01:00 UTC
// ─────────────────────────────────────────────────────────────────────────
export const scheduledLateFee = inngest?.createFunction(
  {
    id: "scheduled-late-fee",
    name: "Daily Late Fee Scan",
    concurrency: 1,
    retries: 3,
  },
  { cron: "0 1 * * *" }, // 01:00 UTC daily
  async ({ step }) => {
    const result = await step.run("scan-late-fees", async () => {
      const { scanAndAccrueLateFees } = await import("@/lib/loanLateFee")
      return scanAndAccrueLateFees()
    })
    logger.info({ result }, "[inngest] scheduled late-fee scan complete")
    return result
  }
)

// ─────────────────────────────────────────────────────────────────────────
// Daily NPL scan — 06:00 UTC
// ─────────────────────────────────────────────────────────────────────────
export const scheduledNplScan = inngest?.createFunction(
  {
    id: "scheduled-npl-scan",
    name: "Daily NPL Classification",
    concurrency: 1,
    retries: 3,
  },
  { cron: "0 6 * * *" }, // 06:00 UTC daily
  async ({ step }) => {
    const result = await step.run("scan-npl", async () => {
      const { scanAllLoansForNpl } = await import("@/lib/loanNpl")
      return scanAllLoansForNpl()
    })
    logger.info({ result }, "[inngest] scheduled NPL scan complete")
    return result
  }
)

// ─────────────────────────────────────────────────────────────────────────
// Daily deposit maturity scan — 08:00 UTC
// ─────────────────────────────────────────────────────────────────────────
export const scheduledMaturityScan = inngest?.createFunction(
  {
    id: "scheduled-maturity-scan",
    name: "Daily Deposit Maturity",
    concurrency: 1,
    retries: 3,
  },
  { cron: "0 8 * * *" }, // 08:00 UTC daily
  async ({ step }) => {
    const result = await step.run("scan-maturities", async () => {
      const { runMaturityScan } = await import("@/lib/deposits/maturityScan")
      return runMaturityScan()
    })
    logger.info({ result }, "[inngest] scheduled maturity scan complete")
    return result
  }
)

// ─────────────────────────────────────────────────────────────────────────
// Message retry pump — every 5 minutes
// ─────────────────────────────────────────────────────────────────────────
//
// This is the schedule that Vercel Hobby's Cron CANNOT fire (min frequency
// is daily on Hobby). Inngest handles it natively.
export const scheduledMessageRetry = inngest?.createFunction(
  {
    id: "scheduled-message-retry",
    name: "Message Retry Pump (5min)",
    concurrency: 1, // never run two retry pumps in parallel
    retries: 2,
  },
  { cron: "*/5 * * * *" }, // every 5 minutes
  async ({ step }) => {
    const result = await step.run("retry-messages", async () => {
      const { runMessageRetry } = await import("@/lib/messages/retry")
      return runMessageRetry()
    })
    logger.info({ result }, "[inngest] scheduled message retry complete")
    return result
  }
)

export const allScheduledFunctions = [
  scheduledBackup,
  scheduledLateFee,
  scheduledNplScan,
  scheduledMaturityScan,
  scheduledMessageRetry,
].filter((f): f is NonNullable<typeof f> => f !== null)
