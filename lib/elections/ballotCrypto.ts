// ============================================================================
// Election ballot crypto — AES-256-GCM with named keys (keyId support).
// ============================================================================
// Extends the project's lib/crypto.ts pattern (AES-256-GCM) with key rotation:
// each ballot stores its keyId; decryption looks up the right key. Keys live
// in environment variables (BALLOT_ENCRYPTION_KEY_<keyId>) — never in the DB.
//
// The active key is BALLOT_ENCRYPTION_KEY (or the fallback ENCRYPTION_KEY /
// NEXTAUTH_SECRET for dev convenience). Key rotation = activate a new keyId;
// existing ballots stay decryptable via their stored keyId.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const SALT = "future-savings|ballot-key"

// Cache of derived keys: keyId → 32-byte Buffer.
const keyCache = new Map<string, Buffer>()

/** Derive (and cache) the 32-byte key for the given keyId from env vars. */
function getKey(keyId: string): Buffer {
  const cached = keyCache.get(keyId)
  if (cached) return cached

  // Try, in order:
  //   1. BALLOT_ENCRYPTION_KEY_<keyId>   (rotated / specific key)
  //   2. BALLOT_ENCRYPTION_KEY            (default active key)
  //   3. ENCRYPTION_KEY                   (shared app key — dev fallback)
  //   4. NEXTAUTH_SECRET                  (last-resort dev fallback)
  const raw =
    process.env[`BALLOT_ENCRYPTION_KEY_${keyId}`] ||
    process.env.BALLOT_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET

  if (!raw) {
    throw new Error(
      `Ballot encryption key "${keyId}" not found. Set BALLOT_ENCRYPTION_KEY (or BALLOT_ENCRYPTION_KEY_${keyId}) in the environment.`
    )
  }

  const derived = scryptSync(raw, SALT, 32)
  keyCache.set(keyId, derived)
  return derived
}

/** Resolve the active keyId for new ballots on a given election. */
export function getActiveKeyId(): string {
  // The active keyId is "v1" by default. When the admin rotates keys, a new
  // BallotKeyRotation row is created with a new keyId (e.g. "v2") AND the env
  // var BALLOT_ENCRYPTION_KEY_v2 must be set. The election's activeKeyId is
  // updated to "v2"; new ballots use it, old ballots still decrypt with "v1".
  return process.env.BALLOT_ENCRYPTION_ACTIVE_KEY_ID || "v1"
}

export interface EncryptedBallot {
  encryptedData: string
  dataHash: string
  keyId: string
}

/** Encrypt the ballot payload (JSON string of selections). */
export function encryptBallot(payload: string, keyId?: string): EncryptedBallot {
  const kid = keyId || getActiveKeyId()
  const key = getKey(kid)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    encryptedData: [iv.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(":"),
    dataHash: sha256(payload),
    keyId: kid,
  }
}

/** Decrypt a ballot payload. Throws on key mismatch / tampering. */
export function decryptBallot(encryptedData: string, keyId: string): string {
  const parts = encryptedData.split(":")
  if (parts.length !== 3) throw new Error("Invalid ballot ciphertext (expected iv:ct:tag).")
  const [ivB64, ctB64, tagB64] = parts
  const key = getKey(keyId)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8")
}

/** SHA-256 hex digest of a string. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

/** SHA-256 hex digest of a canonical JSON string (sorted keys, no whitespace). */
export function sha256Json(value: unknown): string {
  const canonical = JSON.stringify(sortKeys(value))
  return sha256(canonical)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

/** Generate a non-sensitive ballot reference: ELX-YYYY-XXXXXXXX (8 hex chars). */
export function generateBallotReference(electionYear?: number): string {
  const year = electionYear || new Date().getFullYear()
  const random = randomBytes(4).toString("hex").toUpperCase()
  return `ELX-${year}-${random}`
}

/** Hash a client IP or User-Agent for forensic storage (non-reversible). */
export function hashIdentifier(value: string | null | undefined): string | null {
  // Only null/undefined are "no value"; an empty string is a valid (if unusual)
  // input whose sha256 is well-defined and worth preserving for forensics.
  if (value == null) return null
  return sha256(value)
}
