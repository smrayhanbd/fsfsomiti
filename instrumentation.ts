/**
 * Next.js instrumentation hook — runs once per server process at boot.
 *
 * Primary purpose here: ensure Prisma connections are released cleanly when
 * the Node process exits (SIGTERM/SIGINT/beforeExit). The same handlers are
 * ALSO wired inside lib/prisma.ts (guarded by a globalThis flag so they only
 * register once) — duplicating here means that even if some future refactor
 * stops importing lib/prisma.ts at boot, the shutdown handlers still fire.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Importing lib/prisma.ts triggers wireGracefulShutdown() as a side effect.
  // We import dynamically so the Edge runtime (which can't use Prisma) doesn't
  // try to bundle it.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@/lib/prisma')
  }
}
