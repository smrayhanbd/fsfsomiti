import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Anti-privilege-escalation guard tests.
 *
 * Tests the preventSelfTarget, preventSuperAdminTarget, preventSuperAdminRole,
 * and enforcePrivilegeCeiling guards in lib/permissions/api.ts.
 *
 * Mocks prisma + the resolver so we can test the guard logic without a DB.
 */

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    userPermission: {
      findUnique: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    rolePermission: {
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

// Mock the resolver
vi.mock("@/lib/permissions/resolver", () => ({
  isSuperAdminUser: vi.fn(),
  getUserPermissions: vi.fn(),
  hasPermission: vi.fn(),
  permissionGranted: vi.fn(),
}))

// Mock getCurrentUser
vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn(),
}))

import {
  preventSelfTarget,
  preventSuperAdminTarget,
  preventSuperAdminRole,
  enforcePrivilegeCeiling,
} from "@/lib/permissions/api"
import { isSuperAdminUser, getUserPermissions, permissionGranted } from "@/lib/permissions/resolver"
import prisma from "@/lib/prisma"
import type { Role, RolePermission, Permission } from "@prisma/client"

const mockIsSuperAdmin = vi.mocked(isSuperAdminUser)
const mockGetUserPermissions = vi.mocked(getUserPermissions)
const mockPermissionGranted = vi.mocked(permissionGranted)
const mockRoleFindUnique = vi.mocked(prisma.role.findUnique)
const mockRolePermissionFindMany = vi.mocked(prisma.rolePermission.findMany)

const adminUser = { id: "admin-1", email: "admin@test.com", role: "ADMIN" }
const superAdminUser = { id: "super-1", email: "super@test.com", role: "SUPER_ADMIN" }
const targetUser = { id: "target-1", email: "target@test.com", role: "MEMBER" }

// ── Mock object factories ──────────────────────────────────────────────────
// Provide complete objects that satisfy the Prisma types so TypeScript +
// ESLint's `@typescript-eslint/no-explicit-any` rule are both happy.

function makeMockRole(overrides: Partial<Role> = {}): Role {
  return {
    id: "role-1",
    name: "Test Role",
    description: null,
    isSystem: false,
    isSuperAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeMockRolePermission(
  permOverrides: Partial<Permission> = {}
): RolePermission & { permission: Permission } {
  return {
    roleId: "role-1",
    permissionId: "perm-1",
    createdAt: new Date(),
    permission: {
      id: "perm-1",
      menuGroup: "G",
      page: "P",
      tab: "",
      action: "view",
      description: null,
      ...permOverrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("preventSelfTarget — self-modification block", () => {
  it("blocks a user from modifying their own record", () => {
    const result = preventSelfTarget(adminUser, adminUser.id)
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it("allows modifying a different user's record", () => {
    const result = preventSelfTarget(adminUser, targetUser.id)
    expect(result).toBeNull()
  })
})

describe("preventSuperAdminTarget — super-admin user protection", () => {
  it("allows super admins to touch anyone", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    const result = await preventSuperAdminTarget(superAdminUser, "any-user-id")
    expect(result).toBeNull()
  })

  it("blocks non-super-admins from modifying super-admin users", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false) // actor is not super
    mockIsSuperAdmin.mockResolvedValueOnce(true)  // target IS super

    const result = await preventSuperAdminTarget(adminUser, "super-user-id")
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it("allows non-super-admins to modify non-super-admin users", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false) // actor is not super
    mockIsSuperAdmin.mockResolvedValueOnce(false) // target is not super

    const result = await preventSuperAdminTarget(adminUser, "regular-user-id")
    expect(result).toBeNull()
  })
})

describe("preventSuperAdminRole — super-admin role protection", () => {
  it("allows super admins to modify any role", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)

    const result = await preventSuperAdminRole(superAdminUser, "any-role-id")
    expect(result).toBeNull()
    expect(mockRoleFindUnique).not.toHaveBeenCalled()
  })

  it("blocks non-super-admins from modifying super-admin roles", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRoleFindUnique.mockResolvedValueOnce(
      makeMockRole({ isSuperAdmin: true, isSystem: true, name: "Super Admin" })
    )

    const result = await preventSuperAdminRole(adminUser, "super-role-id")
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it("allows non-super-admins to modify regular roles", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRoleFindUnique.mockResolvedValueOnce(
      makeMockRole({ isSuperAdmin: false, isSystem: false, name: "Cashier" })
    )

    const result = await preventSuperAdminRole(adminUser, "cashier-role-id")
    expect(result).toBeNull()
  })

  it("returns 404 when the role doesn't exist", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRoleFindUnique.mockResolvedValueOnce(null)

    const result = await preventSuperAdminRole(adminUser, "nonexistent-id")
    expect(result).not.toBeNull()
    expect(result?.status).toBe(404)
  })
})

describe("enforcePrivilegeCeiling — privilege ceiling rule", () => {
  it("allows super admins to assign any role", async () => {
    mockIsSuperAdmin.mockResolvedValue(true)

    const result = await enforcePrivilegeCeiling(superAdminUser, "any-role-id")
    expect(result).toBeNull()
    expect(mockRolePermissionFindMany).not.toHaveBeenCalled()
  })

  it("allows assignment when role's perms are a subset of actor's", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRolePermissionFindMany.mockResolvedValueOnce([
      makeMockRolePermission({ menuGroup: "G", page: "P", tab: "", action: "view" }),
    ])
    mockGetUserPermissions.mockResolvedValueOnce(new Set(["G::P"]))
    mockPermissionGranted.mockReturnValueOnce(true)

    const result = await enforcePrivilegeCeiling(adminUser, "role-id")
    expect(result).toBeNull()
  })

  it("blocks assignment when role grants a perm the actor doesn't have", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRolePermissionFindMany.mockResolvedValueOnce([
      makeMockRolePermission({ menuGroup: "G", page: "P", tab: "", action: "delete" }),
    ])
    mockGetUserPermissions.mockResolvedValueOnce(new Set(["G::P"]))
    mockPermissionGranted.mockReturnValueOnce(false) // actor doesn't have delete

    const result = await enforcePrivilegeCeiling(adminUser, "role-id")
    expect(result).not.toBeNull()
    expect(result?.status).toBe(403)
  })

  it("allows assignment of a role with no permissions (empty role)", async () => {
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    mockRolePermissionFindMany.mockResolvedValueOnce([])
    mockGetUserPermissions.mockResolvedValueOnce(new Set())

    const result = await enforcePrivilegeCeiling(adminUser, "empty-role-id")
    expect(result).toBeNull()
  })
})
