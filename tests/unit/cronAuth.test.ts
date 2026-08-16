import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { verifyCronRequest } from "@/lib/cron"

/**
 * Cron-secret verification (C3 + M6 fixes).
 *
 * The single helper replaces 7 ad-hoc cron auth checks that:
 *   - accepted `?secret=` query string (leaks into access logs / browser history)
 *   - used `===` / `!==` (timing-attack oracle)
 *   - failed OPEN when CRON_SECRET was unset
 *
 * These tests verify the new contract:
 *   - missing secret → 500 (fail closed)
 *   - missing/empty header → 401
 *   - wrong secret → 401
 *   - correct secret via Authorization: Bearer → ok
 *   - correct secret via x-cron-secret header → ok
 *   - `?secret=` query param is NO LONGER accepted (the regression test)
 */
function makeRequest(headers: Record<string, string> = {}, url = "https://example.test/api/cron"): Request {
  return new Request(url, { method: "POST", headers })
}

describe("verifyCronRequest — header-only constant-time cron auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "a".repeat(64)
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it("fails closed (500) when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET
    const req = makeRequest({ authorization: "Bearer " + "a".repeat(64) })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(500)
      expect(r.error).toMatch(/CRON_SECRET/)
    }
  })

  it("rejects (401) when no auth header is present", () => {
    const req = makeRequest({})
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it("accepts the correct secret via Authorization: Bearer header", () => {
    const req = makeRequest({ authorization: `Bearer ${process.env.CRON_SECRET}` })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(true)
  })

  it("accepts the correct secret via x-cron-secret header", () => {
    const req = makeRequest({ "x-cron-secret": process.env.CRON_SECRET! })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(true)
  })

  it("rejects an incorrect secret with 401", () => {
    const req = makeRequest({ authorization: "Bearer " + "b".repeat(64) })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it("rejects a too-short secret (length mismatch)", () => {
    const req = makeRequest({ authorization: "Bearer short" })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it("does NOT accept the secret via ?secret= query string (C3 regression)", () => {
    // The query-string fallback leaked into access logs / browser history.
    // It must be removed and never reintroduced.
    const req = new Request(`https://example.test/api/cron?secret=${process.env.CRON_SECRET}`, {
      method: "POST",
    })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(401)
  })

  it("prefers Authorization header over x-cron-secret when both are present", () => {
    const req = makeRequest({
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "x-cron-secret": "wrong",
    })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(true)
  })

  it("uses x-cron-secret when Authorization header is absent", () => {
    const req = makeRequest({
      "x-cron-secret": process.env.CRON_SECRET!,
    })
    const r = verifyCronRequest(req)
    expect(r.ok).toBe(true)
  })
})
