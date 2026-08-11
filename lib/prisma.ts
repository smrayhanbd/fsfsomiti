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
  // eslint-disable-next-line no-var
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
  // eslint-disable-next-line no-var
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
const directPrismaClientSingleton = () => {
  // Fall back to the pooled URL when DIRECT_URL isn't configured (e.g. local
  // dev without a pooler). In that case both clients are equivalent.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL
  return new PrismaClient({
    datasources: { db: { url } },
  })
}

export const directPrisma = globalThis.directPrismaGlobal ?? directPrismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.directPrismaGlobal = directPrisma
