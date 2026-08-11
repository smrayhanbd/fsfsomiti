import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  encryptBallot,
  decryptBallot,
  sha256,
  sha256Json,
  generateBallotReference,
  hashIdentifier,
} from "@/lib/elections/ballotCrypto"

/**
 * Ballot crypto roundtrip — AES-256-GCM with key rotation support.
 *
 * The crypto module reads the active key from env vars (BALLOT_ENCRYPTION_KEY
 * | ENCRYPTION_KEY | NEXTAUTH_SECRET). We set these in beforeEach so the
 * tests don't depend on the developer's local .env.
 */
describe("ballotCrypto — encrypt + decrypt roundtrip", () => {
  beforeEach(() => {
    process.env.BALLOT_ENCRYPTION_KEY = "test-ballot-key-not-real"
    process.env.ENCRYPTION_KEY = "test-app-key-not-real-base64=="
    process.env.NEXTAUTH_SECRET = "test-nextauth-secret"
  })

  afterEach(() => {
    delete process.env.BALLOT_ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY
    delete process.env.NEXTAUTH_SECRET
  })

  it("decrypt(encrypt(payload)) === payload", () => {
    const payload = JSON.stringify({
      electionId: "elec-1",
      candidateIds: ["cand-A", "cand-B"],
      timestamp: "2026-08-11T12:00:00Z",
    })
    const enc = encryptBallot(payload)
    const dec = decryptBallot(enc.encryptedData, enc.keyId)
    expect(dec).toBe(payload)
  })

  it("produces a non-empty ciphertext with keyId", () => {
    const enc = encryptBallot("hello")
    expect(enc.encryptedData).toBeTruthy()
    expect(enc.encryptedData).not.toBe("hello") // must be encrypted
    expect(enc.keyId).toBeTruthy()
    expect(enc.dataHash).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex
  })

  it("yields a different ciphertext for the same payload (random IV)", () => {
    const payload = "same-payload"
    const a = encryptBallot(payload)
    const b = encryptBallot(payload)
    // IV is random per call, so the ciphertexts MUST differ.
    expect(a.encryptedData).not.toBe(b.encryptedData)
    // ... but the dataHash is deterministic (sha256(payload)).
    expect(a.dataHash).toBe(b.dataHash)
  })

  it("decrypt throws on tampered ciphertext (GCM auth tag mismatch)", () => {
    const enc = encryptBallot("sensitive-vote")
    const [ivB64, ctB64, tagB64] = enc.encryptedData.split(":")
    // Flip the last byte of the tag — GCM should reject it.
    const tamperedTag = tagB64.slice(0, -2) + "AA"
    const tampered = [ivB64, ctB64, tamperedTag].join(":")
    expect(() => decryptBallot(tampered, enc.keyId)).toThrow()
  })

  it("decrypt throws on malformed ciphertext (wrong number of parts)", () => {
    expect(() => decryptBallot("only:one-part", "v1")).toThrow(
      /Invalid ballot ciphertext/,
    )
  })
})

describe("ballotCrypto — hash helpers", () => {
  it("sha256 is a 64-char hex string", () => {
    const h = sha256("hello")
    expect(h).toMatch(/^[a-f0-9]{64}$/)
    // Reference vector — "hello" → 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(h).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    )
  })

  it("sha256Json is canonical (sorted keys, no whitespace)", () => {
    const a = sha256Json({ b: 2, a: 1 })
    const b = sha256Json({ a: 1, b: 2 })
    // Same payload in different key order → same hash (canonical JSON).
    expect(a).toBe(b)
  })

  it("sha256Json distinguishes different payloads", () => {
    expect(sha256Json({ a: 1 })).not.toBe(sha256Json({ a: 2 }))
  })
})

describe("ballotCrypto — references & identifiers", () => {
  it("generateBallotReference returns ELX-YYYY-XXXXXXXX (8 hex)", () => {
    const ref = generateBallotReference(2026)
    expect(ref).toMatch(/^ELX-2026-[A-F0-9]{8}$/)
  })

  it("generateBallotReference uses the current year if none given", () => {
    const ref = generateBallotReference()
    const year = new Date().getFullYear()
    expect(ref).toContain(`ELX-${year}-`)
  })

  it("hashIdentifier returns null for empty input", () => {
    expect(hashIdentifier(null)).toBeNull()
    expect(hashIdentifier(undefined)).toBeNull()
    expect(hashIdentifier("")).not.toBeNull() // sha256("") is well-defined
  })

  it("hashIdentifier returns a 64-char hex string for non-empty input", () => {
    const h = hashIdentifier("1.2.3.4")
    expect(h).toMatch(/^[a-f0-9]{64}$/)
    // Same input → same hash (deterministic).
    expect(h).toBe(hashIdentifier("1.2.3.4"))
  })
})
