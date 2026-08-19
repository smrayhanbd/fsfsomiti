import { PrismaClient } from '@prisma/client'

// ──────────────────────────────────────────────────────────────────────────
// CONNECTION STRATEGY (Supabase Pooler)
// ──────────────────────────────────────────────────────────────────────────
//  DATABASE_URL  → Supabase TRANSACTION-mode pooler (port 6543, pgbouncer=true)
//                  Multiplexes short-lived serverless clients over a small
//                  backend pool. This is the right default for Vercel Lambdas
//                  and `next dev` — it never holds a backend connection idle.
//  DIRECT_URL    → Supabase SESSION-mode pooler (port 5432) for migrations and
//                  interactive transactions ($transaction callbacks), which need
//                  a pinned backend connection.
//
// ── POOL TUNING (defence-in-depth) ─────────────────────────────────────────
//  Prisma's DEFAULTS are:
//    connection_limit = num_cpus * 2 + 1   (typically 9–13 on a laptop, ~17+ on a server)
//    pool_timeout      = 10s
//
//  These defaults are catastrophically wrong for Supabase's pooled Postgres,
//  whose free tier only allows ~60 direct backend connections. With multiple
//  Vercel Lambdas (each = 1 PrismaClient = full pool) the backend pool is
//  exhausted in seconds and the user sees:
//
//     Timed out fetching a new connection from the connection pool.
//     (Current connection pool timeout: 10, connection limit: 13)
//
//  FIX: explicitly cap `connection_limit` to a small number (5 in dev, 10 in
//  prod) and raise `pool_timeout` to 30s so a transient spike doesn't fail
//  the request immediately. These query-string params are injected
//  programmatically below so they CANNOT be forgotten in .env.
//
// ── SINGLETON ──────────────────────────────────────────────────────────────
//  ONE PrismaClient per process. On Vercel each Lambda is its own process, so
//  each Lambda gets exactly one client (and thus one small pool) — no
//  per-request leaks. In Next.js dev it also survives hot-reloads via the
//  `globalThis` cache.
//
//  `process.env.NODE_ENV !== 'production'` guards the cache so production
//  builds don't accidentally pin a stale client across module reloads.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Inject `connection_limit`, `pool_timeout` and (for Supabase's transaction
 * pooler) `pgbouncer=true` & `pgbouncer_no_instrument=true` into the
 * connection URL. Doing this in code (not just .env) means a future developer
 * can't accidentally regress by copying a bare URL from Supabase's dashboard.
 *
 * If the URL already contains these params, the existing values are kept.
 */
function tuneConnectionUrl(rawUrl: string | undefined, opts: {
  defaultConnectionLimit: number
  defaultPoolTimeout: number
  forcePgBouncer: boolean
}): string | undefined {
  if (!rawUrl) return undefined

  try {
    const u = new URL(rawUrl)
    const p = u.searchParams

    if (!p.has('connection_limit')) {
      p.set('connection_limit', String(opts.defaultConnectionLimit))
    }
    if (!p.has('pool_timeout')) {
      p.set('pool_timeout', String(opts.defaultPoolTimeout))
    }
    // pgbouncer=true is REQUIRED for Supabase's transaction pooler (port 6543).
    // It is FORBIDDEN for the session pooler (port 5432) — Prisma errors at
    // connect time if you set it there.
    if (opts.forcePgBouncer && !p.has('pgbouncer')) {
      p.set('pgbouncer', 'true')
    }
    // Supabase/PgBouncer: Prisma's prepared-statement cache collides with
    // PgBouncer's transaction-mode multiplexing unless we tell it to skip
    // them. See https://www.prisma.io/docs/guides/database/supabase
    if (opts.forcePgBouncer && !p.has('pgbouncer_no_instrument')) {
      p.set('pgbouncer_no_instrument', 'true')
    }

    // Always emit a connection_limit on the direct URL too — without it, a
    // migration or interactive transaction can still hog the whole backend
    // pool. The defaults below are tuned to leave room for the pooled client.
    return u.toString()
  } catch {
    // URL parsing failed (weird local DSN, sqlite, etc.) — return as-is.
    return rawUrl
  }
}

const POOLED_LIMIT = Number(process.env.PRISMA_POOL_LIMIT ?? (process.env.NODE_ENV === 'production' ? 10 : 5))
const POOLED_TIMEOUT = Number(process.env.PRISMA_POOL_TIMEOUT ?? 30)
const DIRECT_LIMIT = Number(process.env.PRISMA_DIRECT_LIMIT ?? (process.env.NODE_ENV === 'production' ? 5 : 3))
const DIRECT_TIMEOUT = Number(process.env.PRISMA_DIRECT_TIMEOUT ?? 60)

// Detect whether DATABASE_URL points at Supabase's transaction pooler (port 6543).
// If so, force pgbouncer=true. If the user is on port 5432 (session pooler) or
// some other DB entirely, do NOT add pgbouncer (Prisma will reject it).
const pooledUrlIsTransactionMode = (() => {
  const u = process.env.DATABASE_URL
  if (!u) return false
  try {
    return new URL(u).port === '6543'
  } catch {
    return false
  }
})()

const TUNED_DATABASE_URL = tuneConnectionUrl(process.env.DATABASE_URL, {
  defaultConnectionLimit: POOLED_LIMIT,
  defaultPoolTimeout: POOLED_TIMEOUT,
  forcePgBouncer: pooledUrlIsTransactionMode,
})

const prismaClientSingleton = () => {
  // When TUNED_DATABASE_URL is undefined (env not set — e.g. unit tests in CI),
  // fall back to constructing PrismaClient WITHOUT a datasource override so it
  // picks up `env("DATABASE_URL")` from schema.prisma. That call would still
  // crash on a real query, but the constructor doesn't — which means importing
  // this module in a test environment doesn't blow up.
  if (!TUNED_DATABASE_URL) {
    return new PrismaClient()
  }
  return new PrismaClient({
    datasources: { db: { url: TUNED_DATABASE_URL } },
    // Log only slow queries + connection warnings — keep the dev console
    // readable. Override with PRISMA_LOG=info,query,warn,error when needed.
    log: process.env.PRISMA_LOG
      ? process.env.PRISMA_LOG.split(',').filter(Boolean) as
          | ('query' | 'info' | 'warn' | 'error')[]
      : ['warn', 'error'],
  })
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
  // eslint-disable-next-line no-var
  var directPrismaGlobal: undefined | ReturnType<typeof directPrismaClientSingleton>
  // eslint-disable-next-line no-var
  var prismaShutdownWired: undefined | boolean
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

// ──────────────────────────────────────────────────────────────────────────
// DIRECT CLIENT — for interactive transactions ($transaction callbacks)
// ──────────────────────────────────────────────────────────────────────────
// Supabase's transaction-mode pooler (port 6543, used by the default `prisma`
// client above) multiplexes connections across queries. This is great for
// short-lived serverless requests but breaks Prisma's interactive
// transactions (`prisma.$transaction(async (tx) => { ... })`), which need
// ALL queries inside the callback to run on the SAME physical connection.
//
// When a transaction holds a pooled connection open for too long (e.g. while
// running many sequential findUnique calls against a remote DB), Supavisor
// reclaims the connection and the next query inside the transaction fails
// with:
//
//   "Transaction not found. Transaction ID is invalid, refers to an old
//    closed transaction Prisma doesn't have information about anymore..."
//
// The fix: route interactive transactions through the SESSION-mode pooler
// (DIRECT_URL, port 5432), which pins each client to a dedicated backend
// connection for the lifetime of the session. This client is slower for
// one-off queries (no multiplexing) but rock-solid for transactions.
//
// Usage:
//   import prisma, { directPrisma } from "@/lib/prisma"
//
//   // Regular queries — use the default (pooled) client:
//   const user = await prisma.user.findUnique({ where: { id } })
//
//   // Interactive transactions — use the direct client:
//   const result = await directPrisma.$transaction(async (tx) => {
//     const a = await tx.a.findFirst(...)
//     const b = await tx.b.create(...)
//     return { a, b }
//   })
//
// ── LAZY INITIALIZATION ────────────────────────────────────────────────────
// The direct client is created LAZILY (on first access) rather than at module
// load time. This is critical for unit tests: `lib/accounting.ts` imports
// `directPrisma` at the top level, which means any test that imports anything
// from `lib/accounting.ts` would trigger PrismaClient instantiation. Without
// DATABASE_URL/DIRECT_URL set (e.g. in CI), the constructor crashes with
// `PrismaClientConstructorValidationError: Invalid value undefined for
// datasource "db"`. Lazy init defers the crash to actual DB access, which
// mocked tests never reach.
const directPrismaClientSingleton = () => {
  // Fall back to the tuned pooled URL when DIRECT_URL isn't configured (e.g.
  // local dev without a session pooler). In that case both clients are
  // equivalent — but transactions on the pooled client may still hit
  // Supavisor's reclaim timer, so prefer configuring DIRECT_URL properly.
  const rawDirectUrl = process.env.DIRECT_URL || process.env.DATABASE_URL

  // Detect whether DIRECT_URL is on port 5432 (session pooler — pgbouncer
  // MUST be absent) or 6543 (transaction pooler — pgbouncer MUST be present).
  let forcePgBouncer = false
  try {
    if (rawDirectUrl) forcePgBouncer = new URL(rawDirectUrl).port === '6543'
  } catch {
    // ignore
  }

  const tunedDirectUrl = tuneConnectionUrl(rawDirectUrl, {
    defaultConnectionLimit: DIRECT_LIMIT,
    defaultPoolTimeout: DIRECT_TIMEOUT,
    forcePgBouncer,
  })

  if (!tunedDirectUrl) {
    return new PrismaClient()
  }
  return new PrismaClient({
    datasources: { db: { url: tunedDirectUrl } },
    log: process.env.PRISMA_LOG
      ? process.env.PRISMA_LOG.split(',').filter(Boolean) as
          | ('query' | 'info' | 'warn' | 'error')[]
      : ['warn', 'error'],
  })
}

// Lazy proxy — the actual PrismaClient is only created on first property
// access. This means importing this module does NOT touch the environment.
export const directPrisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalThis.directPrismaGlobal) {
      globalThis.directPrismaGlobal = directPrismaClientSingleton()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = globalThis.directPrismaGlobal as unknown as Record<string | symbol, any>
    const value = target[prop]
    return typeof value === 'function' ? value.bind(globalThis.directPrismaGlobal) : value
  },
})

// ──────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN — release backend connections on process exit
// ──────────────────────────────────────────────────────────────────────────
// On Vercel, Lambda freeze / kill doesn't give us a SIGTERM, so this is mostly
// a no-op there. But on `next dev`, Docker, PM2, k8s pods, self-hosted VMs,
// and Vercel's build-time evaluation, SIGTERM/SIGINT fire and we should
// release connections promptly so the Supabase backend pool doesn't get
// poisoned with stale idle connections.
//
// We wire this ONCE per process (guarded by `prismaShutdownWired`) so even
// if HMR re-imports this module, we don't stack up duplicate handlers.
function wireGracefulShutdown() {
  if (globalThis.prismaShutdownWired) return
  globalThis.prismaShutdownWired = true

  const shutdown = async (signal: string) => {
    try {
      await Promise.allSettled([
        prisma.$disconnect(),
        globalThis.directPrismaGlobal?.$disconnect(),
      ])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[prisma] error during $disconnect on', signal, err)
    }
    // Give the event loop a tick to flush, then let the process exit.
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  // `beforeExit` fires on Node's natural exit (no pending handles). This is
  // the only hook we have for `next build` and unit-test runners — SIGTERM
  // does not fire in those cases.
  process.on('beforeExit', async () => {
    try {
      await Promise.allSettled([
        prisma.$disconnect(),
        globalThis.directPrismaGlobal?.$disconnect(),
      ])
    } catch {
      // ignore
    }
  })
}

wireGracefulShutdown()

// ──────────────────────────────────────────────────────────────────────────
// POOL-EXHAUSTION RETRY HELPER
// ──────────────────────────────────────────────────────────────────────────
// Even with the pool tuning above, a sudden burst of concurrent requests can
// momentarily exceed `connection_limit` and trigger:
//
//   PrismaClientInitializationError: Timed out fetching a new connection
//   from the connection pool. (Current connection pool timeout: N,
//   connection limit: M)
//
// Wrapping the call site in `withPoolRetry(() => prisma.user.findUnique(...))`
// retries up to 2 times with a short backoff — usually enough for an in-flight
// query to finish and release its connection back to the pool. This is a
// SAFETY NET, not a substitute for proper pool sizing.
const POOL_TIMEOUT_PATTERNS = [
  'Timed out fetching a new connection from the connection pool',
  'Connection terminated due to connection timeout',
  'connection pool timeout',
  // Supavisor's transaction reclaim error inside interactive transactions:
  'Transaction not found',
  'refer to an old closed transaction',
]

export function isPoolExhaustionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const msg = (err as { message?: string }).message ?? String(err)
  return POOL_TIMEOUT_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()))
}

/**
 * Run an async DB operation, retrying up to `retries` times if the pool is
 * momentarily exhausted. Uses exponential backoff with jitter.
 *
 * Usage:
 *   import { withPoolRetry } from "@/lib/prisma"
 *   const user = await withPoolRetry(() => prisma.user.findUnique({ where: { id } }))
 */
export async function withPoolRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2
  const baseMs = opts.baseMs ?? 250

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries || !isPoolExhaustionError(err)) {
        throw err
      }
      // Exponential backoff + jitter: 250ms, 500ms, 1s, ...
      const delay = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}
