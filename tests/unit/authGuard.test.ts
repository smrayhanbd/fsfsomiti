import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Authorization guard unit tests.
 *
 * Mocks the permission resolver so we can test the guard's logic in
 * isolation — specifically the fail-closed behaviour and the SUPER_ADMIN
 * short-circuit.
 */

// Mock the resolver module — vi.mock is hoisted before imports.
vi.mock("@/lib/permissions/resolver", () => ({
  hasPermission: vi.fn(),
  isSuperAdminUser: vi.fn(),
}))

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn(),
}))

// Import after mocks are set up.
import {
  requireAction,
  requirePageAccess,
  canPerformAction,
  AuthorizationError,
  authErrorResult,
} from "@/lib/auth-guard"
import { hasPermission, isSuperAdminUser } from "@/lib/permissions/resolver"

const mockHasPermission = vi.mocked(hasPermission)
const mockIsSuperAdmin = vi.mocked(isSuperAdminUser)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("requireAction — fail-closed enforcement", () => {
  it("throws UNAUTHENTICATED when user is null", async () => {
    await expect(requireAction(null, "G", "P", "a")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    })
  })

  it("throws UNAUTHENTICATED when user is undefined", async () => {
    await expect(requireAction(undefined, "G", "P", "a")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    })
  })

  it("short-circuits for SUPER_ADMIN without checking permissions", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockHasPermission.mockResolvedValue(false) // even if not granted

    const user = { id: "u1", email: "admin@x.com", role: "SUPER_ADMIN" }
    const result = await requireAction(user, "G", "P", "anything")
    expect(result).toBe(user)
    expect(mockHasPermission).not.toHaveBeenCalled()
  })

  it("succeeds when the resolver grants the permission", async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    mockHasPermission.mockResolvedValue(true)

    const user = { id: "u1", email: "user@x.com", role: "MEMBER" }
    const result = await requireAction(user, "G", "P", "create_project")
    expect(result).toBe(user)
    expect(mockHasPermission).toHaveBeenCalledWith("u1", expect.stringContaining("create_project"))
  })

  it("throws FORBIDDEN when permission is denied", async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    mockHasPermission.mockResolvedValue(false)

    const user = { id: "u1", email: "user@x.com", role: "MEMBER" }
    await expect(requireAction(user, "G", "P", "create_project")).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("fail-closed when isSuperAdminUser throws", async () => {
    mockIsSuperAdmin.mockRejectedValue(new Error("DB down"))

    const user = { id: "u1", email: "user@x.com", role: "MEMBER" }
    await expect(requireAction(user, "G", "P", "a")).rejects.toThrow()
  })
})

describe("requirePageAccess — page-level guard", () => {
  it("throws UNAUTHENTICATED when user is null", async () => {
    await expect(requirePageAccess(null, "G", "P")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    })
  })

  it("succeeds for SUPER_ADMIN", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    const user = { id: "u1", email: "x@x.com", role: "SUPER_ADMIN" }
    expect(await requirePageAccess(user, "G", "P")).toBe(user)
  })

  it("throws FORBIDDEN when page access is denied", async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    mockHasPermission.mockResolvedValue(false)

    const user = { id: "u1", email: "x@x.com", role: "MEMBER" }
    await expect(requirePageAccess(user, "G", "P")).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })
})

describe("canPerformAction — non-throwing boolean check", () => {
  it("returns false when user is null", async () => {
    expect(await canPerformAction(null, "G", "P", "a")).toBe(false)
  })

  it("returns true for SUPER_ADMIN without checking permissions", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockHasPermission.mockResolvedValue(false)
    const user = { id: "u1", email: "x@x.com", role: "SUPER_ADMIN" }
    expect(await canPerformAction(user, "G", "P", "a")).toBe(true)
    expect(mockHasPermission).not.toHaveBeenCalled()
  })

  it("returns the resolver's verdict for non-super users", async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    mockHasPermission.mockResolvedValue(true)
    const user = { id: "u1", email: "x@x.com", role: "MEMBER" }
    expect(await canPerformAction(user, "G", "P", "a")).toBe(true)
  })
})

describe("authErrorResult — error → ActionResult conversion", () => {
  it("converts AuthorizationError to { ok: false, error }", () => {
    const e = new AuthorizationError("FORBIDDEN", "No access")
    const result = authErrorResult(e)
    expect(result).toEqual({ ok: false, error: "No access" })
  })

  it("converts generic Error to { ok: false, error }", () => {
    const result = authErrorResult(new Error("Boom"))
    expect(result).toEqual({ ok: false, error: "Boom" })
  })

  it("converts unknown throw values to a generic message", () => {
    const result = authErrorResult("string error")
    expect(result).toEqual({ ok: false, error: "An unexpected error occurred." })
  })
})
