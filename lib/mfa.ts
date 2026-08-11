/**
 * MFA / TOTP 2FA utilities (Roadmap item 13).
 *
 * Wraps `otplib`'s `authenticator` with project-specific defaults:
 *
 *   - 6-digit codes (the de-facto standard for Google Authenticator, Authy,
 *     1Password, Bitwarden, etc.)
 *   - 30-second step (otplib default)
 *   - 1-window tolerance (allows a ±30s clock skew between the user's phone
 *     and the server — common when the user is on a slow network)
 *
 * Three exports cover the lifecycle:
 *
 *   generateMfaSecret()           → new base32 secret for enrollment
 *   getMfaQrCodeUri(email, secret) → otpauth:// URI for QR-code generators
 *   verifyMfaToken(secret, token)   → true/false
 *   generateBackupCodes()           → 10 single-use codes (account recovery)
 *
 * ⚠️ TODO: wire MFA into NextAuth credentials callback — see lib/mfa.ts.
 *   The full two-step flow (password → MFA challenge → JWT) requires either
 *   a custom NextAuth provider or a separate `/api/auth/mfa/verify` step
 *   that exchanges a short-lived challenge token for a session. The
 *   enrollment + verify APIs below are ready to use; the credentials
 *   callback still needs to short-circuit when `user.twoFactorEnabled` is
 *   true and return a structured "MFA_REQUIRED" error the client can act on.
 */
import { authenticator } from "otplib"
import { randomInt } from "node:crypto"

// Allow ±30s of clock skew. Without this, a user whose phone is 31 seconds
// ahead of the server would be permanently locked out.
authenticator.options = {
  window: 1,
}

/** Generate a fresh base32 secret for a new enrollment. */
export function generateMfaSecret(): string {
  return authenticator.generateSecret()
}

/**
 * Build the `otpauth://` URI that QR-code generators (and Google
 * Authenticator imports) understand. Pass this string to a QR library on
 * the client (e.g. `qrcode.react`) — we don't render the QR server-side.
 */
export function getMfaQrCodeUri(email: string, secret: string): string {
  // "Somiti MS" is the issuer label shown in the user's authenticator app
  // above their email. Keep it short — long names get truncated.
  return authenticator.keyuri(email, "Somiti MS", secret)
}

/**
 * Verify a 6-digit TOTP token against the secret. Catches any otplib
 * thrown errors and returns false — we never want a verify failure to
 * propagate as an exception (the caller treats `false` as a denial).
 */
export function verifyMfaToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret })
  } catch {
    return false
  }
}

/**
 * Generate 10 single-use backup codes (8 base32 chars each). Stored
 * hashed on the User row; the user copies them down once during enrollment
 * and types one in if they lose their authenticator device.
 *
 * Uses crypto.getRandomValues for cryptographic randomness — `Math.random`
 * is NOT secure enough for backup codes. The alphabet is RFC 4648 base32
 * (no 0/1/8/9 to avoid look-alikes with O/I/B/g).
 *
 * ⚠️ TODO: hash these with bcrypt before persisting (currently stored in
 * plaintext in `twoFactorBackupCodes`). Hash them and mark them used once
 * redeemed — see the migration in prisma/migrations/20260811000001_*.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function generateBackupCodes(count = 10, length = 8): string[] {
  // Use the Node crypto module — available in Next.js server runtime.
  // ESM import so eslint's no-require-imports rule doesn't flag it.
  return Array.from({ length: count }, () =>
    Array.from({ length }, () => BASE32_ALPHABET[randomInt(0, 32)]).join(""),
  )
}
