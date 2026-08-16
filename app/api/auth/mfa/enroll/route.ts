/**
 * POST /api/auth/mfa/enroll
 *
 * Begin MFA enrollment for the signed-in user. Generates a new TOTP secret,
 * persists it to `User.twoFactorSecret` (but does NOT yet flip
 * `twoFactorEnabled` — that happens only after the user proves they can
 * generate a valid token via /api/auth/mfa/verify). Returns the secret and
 * the otpauth:// URI for the client to render as a QR code.
 *
 * Body:  none (uses the current session)
 * Auth:  required — any signed-in user can enroll
 *
 * Response:
 *   200  { secret: string, qrUri: string, backupCodes: string[] }
 *   401  { error: "Unauthorized" }
 *   500  { error: "Failed to enroll" }
 *
 * NOTE: backupCodes are returned ONCE here — the client must instruct the
 * user to save them somewhere safe. They will not be returned again.
 */
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/permissions"
import {
  generateMfaSecret,
  getMfaQrCodeUri,
  generateBackupCodes,
} from "@/lib/mfa"

export const dynamic = "force-dynamic"

export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const secret = generateMfaSecret()
    const backupCodes = generateBackupCodes()
    const qrUri = getMfaQrCodeUri(user.email, secret)

    // Persist the secret + backup codes. `twoFactorEnabled` stays false
    // until the user verifies a token in /api/auth/mfa/verify — that way
    // a half-finished enrollment can't lock the user out.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorBackupCodes: backupCodes,
      },
    })

    return NextResponse.json({
      secret,
      qrUri,
      backupCodes,
    })
  } catch (err) {
     
    console.error("[/api/auth/mfa/enroll] failed:", err)
    return NextResponse.json(
      { error: "Failed to begin MFA enrollment" },
      { status: 500 },
    )
  }
}
