# Connection-Pool Fix — 2026-08-19

## Symptom

When the user clicks **Save** on any dashboard form (Organization Info, Mail
Settings, Bank Accounts, Profile, Voucher Entry, Member Form, Investment Form,
Project Form, Collection Entry, Transparency Settings, SMS Settings,
Distribution Builder, Account Modal — every form that calls a server action),
the UI flashes:

> **Could not save**
> `Invalid __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$prisma$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].user.findUnique() invocation`
> `Timed out fetching a new connection from the connection pool.`
> `More info: http://pris.ly/d/connection-pool`
> `(Current connection pool timeout: 10, connection limit: 13)`

The trace points at `lib/permissions.ts:getCurrentUser` →
`prisma.user.findUnique({ where: { email } })`, which is the **first DB call**
in every server action and every dashboard layout render. The pool is empty,
so even that single query times out.

---

## Root Cause

Four problems compounded:

### 1. Wrong Prisma pooler mode (the dominant cause)

`lib/prisma.ts` comments described the intended setup as:

> *DATABASE_URL  →  Supabase transaction-mode pooler (port 6543, pgbouncer=true).*
> *DIRECT_URL    →  session-mode pooler (port 5432) for migrations and interactive transactions.*

…but the actual `.env` had **both** URLs pointing at port **5432**
(session-mode). That's the worst-case configuration for a serverless app:

- **Session-mode pooler** (port 5432) — every PrismaClient connection holds a
  dedicated Supabase backend connection for the lifetime of the PrismaClient.
- With Prisma's default `connection_limit = num_cpus * 2 + 1 = 13` per
  PrismaClient, and multiple Vercel Lambdas each spawning their own
  PrismaClient, the Supabase backend pool (60 connections on the free tier)
  is exhausted within seconds under any real traffic.
- Even in `next dev` on a laptop, hot-reload re-instantiates modules; the
  `globalThis.prismaGlobal` singleton is supposed to prevent this, but the
  13-connection pool per singleton is already too large to coexist with the
  parallel-running migration/direct client (also 13 connections).

### 2. No `connection_limit` or `pool_timeout` query params

Prisma's defaults (`connection_limit = num_cpus * 2 + 1`, `pool_timeout = 10s`)
are tuned for a long-lived app server with a private DB, NOT for a serverless
function sharing a 60-connection backend pool. The 10s timeout in particular
is too short — a burst of 5+ concurrent requests can blow through it before
any of them finishes.

### 3. `getCurrentUser()` is not memoized per-request

`lib/permissions.ts:getCurrentUser` was a plain `async function`. Every call
re-issued `prisma.user.findUnique({ where: { email } })`. A single dashboard
page render calls it 2-3 times:

- `app/dashboard/layout.tsx` → `getCurrentUser()`
- The page server component → `getCurrentUser()` (via `requirePermission`)
- Any server action it invokes → `getCurrentUser()` (via `requirePermission`)

Combined with `requireActiveUser` issuing a **second** `findUnique` to check
`isActive`, a single user click could fire 4-6 `findUnique` calls against
the same row. Each consumes a connection from the pool. Multiply by 3-5
concurrent users and the pool is gone.

### 4. No `$disconnect()` on process exit

`SIGTERM`/`SIGINT`/`beforeExit` didn't release connections. Frozen Vercel
Lambdas and `next dev` Ctrl-C left connections dangling on Supabase's side
until Supavisor's idle-reaper kicked in (typically 30-60s later). During
that window, the backend pool was artificially smaller than it should have
been.

---

## The Fix

### `lib/prisma.ts` (rewritten)

- **`tuneConnectionUrl()`** — programmatically injects
  `connection_limit`, `pool_timeout`, and (when the URL is on port 6543)
  `pgbouncer=true&pgbouncer_no_instrument=true` into the connection string,
  regardless of what's in `.env`. This means even if a future developer
  copies a bare URL from Supabase's dashboard, the pool is still tuned
  correctly. Existing params in the URL are respected (not overwritten).
- **Smaller, smarter pool defaults**:
  - `PRISMA_POOL_LIMIT`  — 10 (prod), 5 (dev) — was 13
  - `PRISMA_POOL_TIMEOUT` — 30s — was 10s
  - `PRISMA_DIRECT_LIMIT` — 5 (prod), 3 (dev) — was 13
  - `PRISMA_DIRECT_TIMEOUT` — 60s — was 10s
  - All overridable via env vars.
- **Graceful shutdown** — `wireGracefulShutdown()` registers SIGTERM/SIGINT
  handlers that call `prisma.$disconnect()` and `directPrisma.$disconnect()`
  before letting the process exit. Guarded by `globalThis.prismaShutdownWired`
  so HMR doesn't stack duplicate handlers.
- **`withPoolRetry()`** — a safety-net helper that retries an async DB
  operation up to 2 times with exponential backoff + jitter when the error
  matches the pool-exhaustion signature. Usage is opt-in:

  ```ts
  import { withPoolRetry } from "@/lib/prisma"
  const user = await withPoolRetry(() => prisma.user.findUnique({ where: { id } }))
  ```

  This is NOT a substitute for proper pool sizing — it just buys a few
  hundred ms of grace during a transient burst.

- **`isPoolExhaustionError()`** — exported so application code can detect
  pool-exhaustion errors and show a friendly "Database is busy, please retry"
  message instead of a raw stack trace.

### `lib/permissions.ts` (patched)

- **`getCurrentUser()` is now wrapped in React's `cache()`** — the same
  per-request memoization the codebase already uses for
  `getUserPermissions`. Within a single server render or server action,
  the DB is hit at most ONCE per email, no matter how many components
  call `getCurrentUser()`.
- **`requireActiveUser()` now reuses the cached row** — instead of issuing
  a second `prisma.user.findUnique({ where: { id }, select: { isActive: true } })`,
  it reads `isActive` from the row that `getCurrentUser()` already cached.
  Falls back to a one-shot query if the cached row somehow lacks the
  `isActive` field (defensive — shouldn't happen with the new code).

### `.env` (corrected)

- `DATABASE_URL` now uses **port 6543** with
  `?pgbouncer=true&pgbouncer_no_instrument=true&connection_limit=10&pool_timeout=30`.
- `DIRECT_URL` stays on **port 5432** with
  `?connection_limit=5&pool_timeout=60`.

### `.env.example` (new file)

Sanitized template documenting the correct Supabase pooler config so future
developers don't accidentally regress to bare URLs.

### `instrumentation.ts` (new file)

Next.js instrumentation hook — imports `lib/prisma.ts` once at boot so the
graceful-shutdown handlers are registered before the first request. Also
doubles as a single place to add future boot-time instrumentation (Sentry,
OpenTelemetry, etc.).

---

## Verification

After applying the fix:

1. Run `npm run dev` and load any dashboard page.
2. Open DevTools → Network tab. Watch the `/_next/...` server-action
   requests — they should all return 200, no `Could not save` toast.
3. Check the dev console — you should NOT see any
   `Timed out fetching a new connection from the connection pool` messages.
4. (Optional) Set `PRISMA_LOG=query,warn,error` in `.env` to see each
   query. Confirm that a single dashboard page render fires at most one
   `prisma.user.findUnique` call (down from 2-3 before).
5. (Optional) Stress-test with `ab -n 50 -c 10 http://localhost:3000/dashboard`
   — should complete without pool-exhaustion errors.

If the error returns:

- Double-check `.env` — `DATABASE_URL` MUST be on port 6543 with
  `pgbouncer=true`. The most common regression is copying the URL from
  Supabase's dashboard "Session" tab instead of "Transaction" tab.
- Check that `lib/prisma.ts`'s `tuneConnectionUrl()` is still in place —
  it's the safety net that fixes a misconfigured `.env` automatically.
- Run `npx prisma validate` to confirm the schema still parses.
- If you're on a Vercel deployment, redeploy — env var changes require a
  fresh Lambda to pick them up.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/prisma.ts` | Rewritten: added `tuneConnectionUrl`, smaller pool defaults, `wireGracefulShutdown`, `withPoolRetry`, `isPoolExhaustionError` exports |
| `lib/permissions.ts` | `getCurrentUser` wrapped in `cache()`; `requireActiveUser` reuses cached row |
| `.env` | `DATABASE_URL` switched to port 6543 + pgbouncer; both URLs get `connection_limit` + `pool_timeout` |
| `.env.example` | New file — sanitized template with full Supabase pooler documentation |
| `instrumentation.ts` | New file — boot hook registers Prisma shutdown handlers |
