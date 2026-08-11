import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { isSuperAdminUser } from "@/lib/permissions/resolver"
import RolesManagerClient from "./RolesManagerClient"

export const dynamic = "force-dynamic"

// Role Manager — list of all roles with member/permission counts. Super Admin
// or users holding "manage_permissions" may reach this (the sidebar hides it
// otherwise; this is the server-side guard).
export default async function RolesManagerPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const allowed = await isSuperAdminUser(user.id)
  if (!allowed) redirect("/dashboard/unauthorized")

  const roles = await prisma.role.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true, permissions: true } } },
  })

  // Serialize nothing sensitive — just the fields the client needs.
  const data = roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isSuperAdmin: r.isSuperAdmin,
    userCount: r._count.users,
    permissionCount: r._count.permissions,
    createdAt: r.createdAt.toISOString(),
  }))

  return <RolesManagerClient roles={data} />
}
