/**
 * POST /api/auth/mfa/verify
 *
 * Complete MFA enrollment: verify a 6-digit TOTP token against the
 * previously-stored secret and, on success, flip `twoFactorEnabled = true`.
 *
 * Body:  { token: "123456" }
 * Auth:  required — only the signed-in user can verify their own enrollment.
 *
 * Response:
 *   200  { ok: true, enabled: true }
 *   400  { ok: false, error: "Invalid token" }
 *   401  { error: "Unauthorized" }
 *   409  { ok: false, error: "No pending enrollment — call /api/auth/mfa/enroll first" }
 *   500  { error: "Failed to verify" }
 *
 * NOTE: this is the ENROLLMENT verify, not the LOGIN verify. Login MFA
 * challenge is a separate flow — see TODO in lib/mfa.ts.
 */
import { NextResponse, type NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/permissions"
import { verifyMfaToken } from "@/lib/mfa"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse the token from the JSON body. Reject anything that isn't a
  // 6-digit string — early-reject malformed input so we don't burn a TOTP
  // attempt on it.
  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json(
      { ok: false, error: "Token must be 6 digits." },
      { status: 400 },
    )
  }

  try {
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    })

    if (!fullUser?.twoFactorSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "No pending enrollment — call /api/auth/mfa/enroll first.",
        },
        { status: 409 },
      )
    }

    if (!verifyMfaToken(fullUser.twoFactorSecret, token)) {
      return NextResponse.json(
        { ok: false, error: "Invalid token. Try again." },
        { status: 400 },
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    })

    return NextResponse.json({ ok: true, enabled: true })
  } catch (err) {
     
    console.error("[/api/auth/mfa/verify] failed:", err)
    return NextResponse.json(
      { error: "Failed to verify MFA token" },
      { status: 500 },
    )
  }
}
