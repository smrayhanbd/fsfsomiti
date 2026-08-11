import prisma from "@/lib/prisma"
import { redirect, notFound } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { getPermissionsForClient } from "@/lib/permissions/resolver"
import UserEditClient from "./UserEditClient"

export const dynamic = "force-dynamic"

export default async function UserEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      createdBy: true,
      permissions: { select: { permission: true } },
      roles: {
        select: {
          role: {
            select: { id: true, name: true, description: true, isSystem: true, isSuperAdmin: true },
          },
          assignedAt: true,
        },
      },
      permOverrides: {
        select: {
          id: true,
          effect: true,
          reason: true,
          permission: { select: { id: true, menuGroup: true, page: true, tab: true, action: true } },
        },
      },
    },
  })
  if (!target) notFound()

  // Effective permission set for the preview tree (resolved server-side).
  const effectiveKeys = await getPermissionsForClient(target.id)

  // All roles available for assignment (for the add-role dropdown).
  const allRoles = await prisma.role.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, isSystem: true, isSuperAdmin: true },
  })

  // The user's current primary role id for the form's Role dropdown.
  // Prefer a non-super functional role; fall back to a super-admin role.
  const currentRoleId =
    target.roles.find((ur) => !ur.role.isSuperAdmin)?.role.id ??
    target.roles.find((ur) => ur.role.isSuperAdmin)?.role.id ??
    null

  return (
    <UserEditClient
      user={{
        id: target.id,
        email: target.email,
        name: target.name,
        phone: target.phone,
        role: target.role,
        isActive: target.isActive,
        lastLogin: target.lastLogin?.toISOString() ?? null,
        createdAt: target.createdAt.toISOString(),
        createdBy: target.createdBy,
        permissions: target.permissions.map((p) => p.permission),
        // New RBAC data for the Permissions & Roles card.
        assignedRoles: target.roles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description,
          isSystem: ur.role.isSystem,
          isSuperAdmin: ur.role.isSuperAdmin,
          assignedAt: ur.assignedAt.toISOString(),
        })),
        overrides: target.permOverrides.map((o) => ({
          id: o.id,
          effect: o.effect,
          reason: o.reason,
          permission: o.permission,
        })),
        effectiveKeys,
      }}
      allRoles={allRoles}
      currentRoleId={currentRoleId}
      canManage={isSuperAdmin(user)}
      currentUserId={user.id}
    />
  )
}
