/**
 * Edge middleware — route protection + role-based routing.
 *
 * Uses `withAuth` from `next-auth/middleware` (the officially recommended
 * approach for NextAuth v4) instead of `getToken` from `next-auth/jwt`.
 * The `next-auth/jwt` subpath export fails to resolve under Next.js 16 +
 * Turbopack on Windows — `withAuth` is the same code path internally but
 * is exported from `./middleware` which bundles correctly.
 *
 * Flow:
 *   1. withAuth decodes the JWT cookie. If no valid token → redirect to
 *      `pages.signIn` (which is `/`). Our handler below only runs when a
 *      valid token exists.
 *   2. The handler does role-based routing:
 *      - /dashboard → ADMIN + SUPER_ADMIN only; everyone else → /portal
 *      - /portal    → MEMBER only; everyone else → /dashboard
 *      - MFA_PENDING role (step-1 of MFA login) → /login/mfa to complete
 *        step-2, regardless of which path they tried to access.
 */
import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname
    const role = req.nextauth.token?.role as string | undefined

    // Step-1-only MFA session — never let them through to dashboard/portal
    // without completing the TOTP challenge. Redirect to /login/mfa with the
    // userId so the page can submit it to the credentials-mfa provider.
    if (role === "MFA_PENDING") {
      const userId = (req.nextauth.token?.id as string | undefined) ?? ""
      const url = new URL(`/login/mfa?userId=${encodeURIComponent(userId)}`, req.url)
      return NextResponse.redirect(url)
    }

    // If a MEMBER tries to access the Admin Dashboard, redirect to Member Portal.
    // Both ADMIN and SUPER_ADMIN may enter the dashboard.
    if (
      path.startsWith("/dashboard") &&
      role !== "ADMIN" &&
      role !== "SUPER_ADMIN"
    ) {
      return NextResponse.redirect(new URL("/portal", req.url))
    }

    // If an ADMIN tries to access the Member Portal, redirect to Admin Dashboard
    if (path.startsWith("/portal") && role !== "MEMBER") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  },
  {
    secret: process.env.NEXTAUTH_SECRET,
    pages: { signIn: "/" },
  },
)

export const config = {
  // This ensures the middleware ONLY runs on protected routes.
  // Your landing page ("/"), login ("/login"), and register ("/register")
  // remain completely public.
  matcher: ["/dashboard/:path*", "/portal/:path*"],
}
