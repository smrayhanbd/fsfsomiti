import { PrismaClient } from '@prisma/client'

// Connection strategy (see prisma/schema.prisma `directUrl`):
//  - DATABASE_URL  -> Supabase transaction-mode pooler (port 6543, pgbouncer=true).
//                    Multiplexes short-lived serverless clients so Vercel Lambdas
//                    never exhaust the backend pool (the old EMAXCONNSESSION error).
//  - DIRECT_URL    -> session-mode pooler (port 5432) for migrations and
//                    interactive transactions ($transaction callbacks).
//
// This singleton keeps ONE client alive per process. On Vercel each Lambda is its
// own process, so each Lambda gets exactly one client (and thus one small pool) —
// no per-request leaks. In Next.js dev it also survives hot-reloads.
const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
   
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
   
  var directPrismaGlobal: undefined | ReturnType<typeof directPrismaClientSingleton>
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
  // Fall back to the pooled URL when DIRECT_URL isn't configured (e.g. local
  // dev without a pooler). In that case both clients are equivalent.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  return new PrismaClient({
    datasources: { db: { url } },
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
