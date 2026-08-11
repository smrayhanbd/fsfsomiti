import { NextRequest } from "next/server"
import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

// next-auth v4 was written for Next.js 13/14, where App Router route-handler
// `context.params` was a plain object. Next.js 16 made `params` an async
// Promise, and v4's argument-sniffing wrapper (NextAuth(...)) does not reliably
// handle that on every resolution path.
//
// We therefore create the handler once with NextAuth(authOptions) and call it
// with a context whose `params` is ALREADY awaited. next-auth's App-Router
// branch triggers on `context.params` being present, and re-awaits it
// harmlessly, so a resolved object works. We also force `dynamic` because every
// auth request reads cookies/headers at runtime.
//
// Without this, /api/auth/session resolves to 404 → the browser's useSession()
// fetch receives the 404 HTML page → "Unexpected token '<' ... is not valid JSON".
// Server-side getServerSession() is unaffected (it calls AuthHandler directly),
// which is why dashboard pages still render (200) even though the client fetch
// fails.

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type NextAuthParams = { params: Promise<{ nextauth?: string[] }> }

// One handler instance, reused by both HTTP verbs.
const handler = NextAuth(authOptions)

async function route(req: NextRequest, context: NextAuthParams) {
  const params = await context.params
  // Pass the awaited params object; next-auth's route branch keys off its presence.
  return handler(req as never, { params } as never)
}

export { route as GET, route as POST }
