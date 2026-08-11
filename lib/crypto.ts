import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto"

/**
 * Reversible symmetric encryption for secrets stored at rest (SMTP passwords,
 * provider API keys, tokens, transparency iBanking credentials, MFA TOTP
 * secrets). NOT for password hashing — that stays in bcrypt.
 *
 * Algorithm: AES-256-GCM with a random 12-byte IV per value AND a random
 * 16-byte salt per value. The salt is mixed into the scrypt key derivation so
 * every ciphertext is encrypted under a unique derived key — defeating the
 * rainbow-table / precomputation attack flagged in S18 (a single hardcoded
 * salt would let an attacker precompute keys for a known passphrase).
 *
 * Output format (current, per-row salt):
 *   base64(iv) : base64(salt) : base64(ciphertext) : base64(tag)
 *
 * Output format (legacy, before S18 follow-up — still readable by decrypt):
 *   base64(iv) : base64(ciphertext) : base64(tag)
 *
 * Key source: `ENCRYPTION_KEY` env var (REQUIRED). The legacy fallback to
 * NEXTAUTH_SECRET was removed (S18) — reusing the auth secret as a data
 * encryption key blurred the blast radius of a single secret leak. Operators
 * who still have legacy ciphertext encrypted under NEXTAUTH_SECRET must run
 * `scripts/re-encrypt-secrets.ts` after setting ENCRYPTION_KEY to the same
 * value used at write time, then update ENCRYPTION_KEY going forward.
 */

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const SALT_LEN = 16

// S18 follow-up: the static salt is RETAINED ONLY for backward-compatible
// decryption of legacy 3-part ciphertexts written before per-row salts landed.
// New writes never use this constant — they generate a fresh random salt
// per encryption. Once `scripts/re-encrypt-secrets.ts` has been run on every
// environment, this constant can be deleted.
//
// TODO: re-encrypt all stored secrets under the new per-row salt scheme — see migration script.
const LEGACY_STATIC_SALT = "future-savings|settings-key"

/**
 * Resolve + cache the ENCRYPTION_KEY env var. Throws if unset — the legacy
 * NEXTAUTH_SECRET fallback was removed per S18 because reusing the auth
 * secret as a data-encryption key expanded its blast radius.
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Mail/SMS secrets cannot be encrypted or decrypted " +
        "without it. Set ENCRYPTION_KEY (a 32+ char random string) — it MUST be identical " +
        "across local, staging, and production. (The legacy NEXTAUTH_SECRET fallback was " +
        "removed in S18; if you have existing ciphertext written under NEXTAUTH_SECRET, " +
        "temporarily restore that value as ENCRYPTION_KEY and run " +
        "scripts/re-encrypt-secrets.ts to migrate to the new per-row-salt scheme.)"
    )
  }
  // Derive without a salt just for cache identity — actual key derivation in
  // encrypt/decrypt mixes a per-row salt via scrypt.
  return Buffer.from(raw, "utf8")
}

/** Raw ENCRYPTION_KEY bytes (cached via closure-level memoization below). */
let cachedKeyMaterial: Buffer | null = null
function keyMaterial(): Buffer {
  if (cachedKeyMaterial) return cachedKeyMaterial
  cachedKeyMaterial = getEncryptionKey()
  return cachedKeyMaterial
}

/**
 * Derive a 32-byte AES key from ENCRYPTION_KEY + a per-row salt. scrypt's
 * work factor (N=16384 by default in Node) makes brute-forcing the passphrase
 * computationally expensive, and the per-row salt ensures each ciphertext is
 * encrypted under a unique derived key.
 */
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(keyMaterial(), salt, 32)
}

/**
 * Derive the legacy key — same ENCRYPTION_KEY material mixed with the old
 * static salt. Only used to decrypt 3-part ciphertexts written before the
 * per-row-salt migration. New writes never call this.
 */
function deriveLegacyKey(): Buffer {
  return scryptSync(keyMaterial(), LEGACY_STATIC_SALT, 32)
}

/** Encrypt a plaintext secret into an opaque string safe to store in a DB column. */
export function encrypt(plain: string): string {
  if (plain === "") return ""
  const iv = randomBytes(IV_LEN)
  const salt = randomBytes(SALT_LEN)
  const key = deriveKey(salt)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("base64"), salt.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(":")
}

/**
 * Decrypt a value produced by {@link encrypt}.
 *
 * Supports BOTH formats:
 *   - 4-part (current, per-row salt): `iv:salt:ciphertext:tag`
 *   - 3-part (legacy, static salt):   `iv:ciphertext:tag`
 *
 * The legacy branch keeps existing DB rows decryptable after the S18 follow-up
 * lands; once `scripts/re-encrypt-secrets.ts` has been run on every
 * environment, the legacy branch (and `deriveLegacyKey`) can be deleted.
 */
export function decrypt(payload: string): string {
  if (!payload) return ""
  const parts = payload.split(":")
  if (parts.length !== 4 && parts.length !== 3) {
    throw new Error("Invalid ciphertext payload (expected iv:salt:ct:tag or legacy iv:ct:tag).")
  }

  const tryKey = (key: Buffer, ivB64: string, ctB64: string, tagB64: string): string | null => {
    try {
      const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"))
      decipher.setAuthTag(Buffer.from(tagB64, "base64"))
      return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8")
    } catch {
      return null
    }
  }

  if (parts.length === 4) {
    // Current format: iv:salt:ciphertext:tag — derive key from per-row salt.
    const [ivB64, saltB64, ctB64, tagB64] = parts
    const salt = Buffer.from(saltB64, "base64")
    const key = deriveKey(salt)
    const result = tryKey(key, ivB64, ctB64, tagB64)
    if (result !== null) return result
    // A 4-part payload that fails under the per-row-salt key is unrecoverable;
    // we don't silently try the legacy key because that would mask a real
    // tampering / wrong-key situation (GCM auth tag would catch it).
  } else {
    // Legacy 3-part format: iv:ciphertext:tag — derive key with the old
    // static salt. Branch only exists for backward-compat with rows written
    // before the S18 per-row-salt migration. See TODO above.
    const [ivB64, ctB64, tagB64] = parts
    const legacyKey = deriveLegacyKey()
    const result = tryKey(legacyKey, ivB64, ctB64, tagB64)
    if (result !== null) return result
  }

  throw new Error(
    "Failed to decrypt a stored secret. This almost always means the encryption key differs from the " +
      "value used when the secret was saved (for example: secret saved on localhost, then read on " +
      "Vercel which has a different or missing ENCRYPTION_KEY). Set the SAME ENCRYPTION_KEY on " +
      "every environment, then re-save the mail/SMS credentials (or run scripts/re-encrypt-secrets.ts)."
  )
}

/**
 * Re-encrypt only when the caller supplied a non-empty new value. Returns the
 * existing ciphertext untouched when `next` is blank — used by the settings
 * save actions so a masked/blank password field does not wipe the stored secret.
 *
 * Note: when `next` is blank we return the EXISTING ciphertext verbatim, which
 * may still be in the legacy 3-part format. Operators should run
 * `scripts/re-encrypt-secrets.ts` once after deploying the new code to migrate
 * all legacy rows to the per-row-salt scheme.
 */
export function reencrypt(next: string | null | undefined, existing: string | null | undefined): string | null {
  if (next && next.trim() !== "") return encrypt(next.trim())
  return existing ?? null
}

/** Mask a secret for display in the UI. Returns nothing meaningful to reveal. */
export function mask(value: string | null | undefined): string {
  if (!value) return ""
  return "•".repeat(Math.min(16, Math.max(8, value.length)))
}
