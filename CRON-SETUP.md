# Cron Setup (Inngest)

All scheduled jobs in this project run via **Inngest**. Vercel Cron is no
longer used — it's capped at 2 daily jobs on the Hobby plan and cannot
fire the every-5-minutes message retry pump.

## Scheduled jobs

| Schedule (UTC) | Function | Purpose |
|---|---|---|
| `0 1 * * *` (01:00 daily) | `scheduled-late-fee` | Accrue daily late fees on overdue loans |
| `0 2 * * *` (02:00 daily) | `scheduled-backup` | Database backup |
| `0 6 * * *` (06:00 daily) | `scheduled-npl-scan` | Classify non-performing loans |
| `0 8 * * *` (08:00 daily) | `scheduled-maturity-scan` | Process matured deposits |
| `*/5 * * * *` (every 5 min) | `scheduled-message-retry` | Retry failed SMS/email sends |

All 5 functions are defined in `lib/inngest/scheduled.ts` and registered
via `/api/inngest/route.ts`.

---

## Production setup (one-time)

### Step 1: Create an Inngest account

1. Go to https://www.inngest.com → Sign up (free tier, no credit card).
2. Create a new app → name it `somiti-ms`.
3. Copy the **Event Key** and **Signing Key** from the app settings.

### Step 2: Add env vars to Vercel

In your Vercel project → Settings → Environment Variables, add these to
**both** Production and Preview environments:

| Name | Value |
|---|---|
| `INNGEST_EVENT_KEY` | (from Inngest dashboard) |
| `INNGEST_SIGNING_KEY` | (from Inngest dashboard) |

Also set `CRON_SECRET` (for manual admin triggers via the route handlers):

```bash
openssl rand -hex 32
```

### Step 3: Redeploy

Trigger a redeploy on Vercel so the new env vars are picked up. The
`/api/inngest` route will now accept requests from Inngest Cloud.

### Step 4: Register your app URL in Inngest

In the Inngest dashboard → Apps → your app → **Edit**:

- **App URL**: `https://YOUR-DEPLOYMENT.vercel.app/api/inngest`
  - Use your **production** URL (not a preview URL) to avoid Vercel
    Deployment Protection blocking sync. See "Deployment Protection"
    below if you must use a preview URL.
- **Deployment Protection Key**: leave empty (production URL is public)

Click **Sync**. You should see:

```
✓ Successfully synced
✓ Found 11 functions:
  - scheduled-backup (cron: 0 2 * * *)
  - scheduled-late-fee (cron: 0 1 * * *)
  - scheduled-npl-scan (cron: 0 6 * * *)
  - scheduled-maturity-scan (cron: 0 8 * * *)
  - scheduled-message-retry (cron: */5 * * * *)
  - backup-scheduled (event)
  - transaction-approved-notify (event)
  - transaction-reversed-notify (event)
  - loan-repayment-recorded (event)
  - loan-disbursed-notify (event)
  - election-notification-dispatch (event)
  - member-wishes-send (event)
```

### Step 5: Verify

In the Inngest dashboard → Functions → click any scheduled function →
**Run Now** to trigger it manually. Check the run log for success.

The 5 scheduled functions will now fire automatically on their cron
schedules.

---

## Local development

### Option A: Inngest dev server (recommended)

The Inngest dev server runs locally and fires your scheduled functions
on their cron schedules — no Inngest account needed.

```bash
# In one terminal — start your Next.js app
npm run dev

# In another terminal — start the Inngest dev server
npx --ignore-scripts=false inngest-cli@latest dev
```

The dev server will:
1. Start on `http://localhost:8288`
2. Auto-detect your Next.js app on `http://localhost:3000`
3. Register your `/api/inngest` route
4. Begin firing your scheduled functions on schedule

Open `http://localhost:8288` to see the dashboard with all 11 functions
listed. You can manually trigger any function from there.

> **Note on `--ignore-scripts=false`**: if your npm is configured to skip
> install scripts (common in secure environments), the Inngest CLI binary
> won't be downloaded. The flag forces npm to run the postinstall script.
> If it still fails, clear the npx cache:
> `rmdir /s /q "%USERPROFILE%\.npm\_npx"` (Windows) or
> `rm -rf ~/.npm/_npx` (macOS/Linux), then retry.

### Option B: Manual admin triggers

Without the Inngest dev server, you can trigger any cron job manually
via its route handler:

```bash
# Set CRON_SECRET in .env first
curl -X POST http://localhost:3000/api/loans/late-fee \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/backup/run \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/loans/npl-scan \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/deposits/maturity-scan \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/messages/retry \
  -H "Authorization: Bearer $CRON_SECRET"
```

The route handlers share the same business logic as the Inngest
functions (extracted into `lib/` modules), so behaviour is identical.

---

## Deployment Protection (Vercel)

If you have Vercel Deployment Protection enabled (Vercel Authentication),
Inngest Cloud cannot reach your `/api/inngest` route on preview
deployments — it will get a login screen instead of JSON.

### Fix: use the production URL

**Production deployments are always public** — Vercel Authentication
only protects preview deployments. Point Inngest at your production URL:

```
https://your-app.vercel.app/api/inngest
```

NOT a preview URL like `https://your-app-git-main-username.vercel.app`.

### Fix: use a Protection Bypass Token (for preview testing)

If you must test Inngest against a preview deployment:

1. Vercel → Project → Settings → Deployment Protection
2. Find **Protection Bypass for Automation**
3. Click **Generate Secret** → copy the token
4. Inngest dashboard → Apps → your app → Edit
5. Paste the token in the **Deployment Protection Key** field
6. Save → Sync

Inngest will send `x-vercel-protection-bypass: <token>` as a header on
every request, and Vercel will let it through.

---

## Architecture

```
                    ┌─────────────────────┐
                    │   Inngest Cloud      │
                    │   (scheduler)        │
                    └──────────┬──────────┘
                               │ fires on cron schedule
                               ▼
                    ┌─────────────────────┐
                    │  /api/inngest        │
                    │  (webhook endpoint)  │
                    └──────────┬──────────┘
                               │ invokes registered function
                               ▼
        ┌──────────────────────┴──────────────────────┐
        │                                             │
        ▼                                             ▼
┌─────────────────┐                       ┌─────────────────────┐
│ lib/inngest/    │                       │ lib/inngest/        │
│ jobs.ts         │                       │ scheduled.ts        │
│ (event-triggered)│                      │ (cron-triggered)    │
└─────────────────┘                       └──────────┬──────────┘
                                                     │ calls
                                                     ▼
                                          ┌─────────────────────┐
                                          │ lib/ business logic │
                                          │ (shared with routes)│
                                          └─────────────────────┘
                                                     ▲
                                                     │ also calls
                                          ┌─────────────────────┐
                                          │ /api/{cron}/route.ts│
                                          │ (manual admin       │
                                          │  triggers)          │
                                          └─────────────────────┘
```

The route handlers at `/api/{backup/run,loans/late-fee,loans/npl-scan,
deposits/maturity-scan,messages/retry}` still exist for manual admin
triggers via the dashboard. They share the same business logic as the
Inngest functions:

| Route | Shared lib function |
|---|---|
| `/api/backup/run` | `lib/backup/scheduledBackup.ts` → `runScheduledBackup()` |
| `/api/loans/late-fee` | `lib/loanLateFee.ts` → `scanAndAccrueLateFees()` |
| `/api/loans/npl-scan` | `lib/loanNpl.ts` → `scanAllLoansForNpl()` |
| `/api/deposits/maturity-scan` | `lib/deposits/maturityScan.ts` → `runMaturityScan()` |
| `/api/messages/retry` | `lib/messages/retry.ts` → `runMessageRetry()` |

Both callers (Inngest + route handler) are idempotent — a double-fire
is safe. The route handlers additionally use `lib/cronLock.ts` for
multi-instance safety (Upstash Redis when configured, in-memory fallback).

---

## Troubleshooting

### "Inngest not configured — set INNGEST_EVENT_KEY"

The `/api/inngest` route returned 503 because `INNGEST_EVENT_KEY` is
not set in the environment. Add it to Vercel env vars and redeploy.

### Inngest sync fails with 401 / 403

Vercel Deployment Protection is blocking Inngest. Use the production
URL (not a preview URL) or generate a Protection Bypass Token — see
the "Deployment Protection" section above.

### Functions don't fire on schedule

1. Check the Inngest dashboard → Functions → verify all 5 scheduled
   functions are listed with their cron expressions.
2. Check the **Sync** tab — the last sync should be recent and successful.
3. Click **Run Now** on a function to trigger it manually and see if
   it executes without errors.
4. Check Vercel logs for `/api/inngest` — Inngest Cloud should be
   hitting it regularly to invoke functions.

### "Inngest CLI binary not found"

Your npm is configured to skip install scripts. Fix:

```bash
# Clear the npx cache
rmdir /s /q "%USERPROFILE%\.npm\_npx"      # Windows
rm -rf ~/.npm/_npx                          # macOS/Linux

# Install globally with scripts enabled
npm install -g --ignore-scripts=false inngest-cli

# Run
inngest-cli dev
```

Or download the binary directly from
https://github.com/inngest/inngest/releases/latest — no npm needed.
