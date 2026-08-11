import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import UsersClient from "./UsersClient"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const canManage = isSuperAdmin(user)

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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
    },
  })

  return (
    <UsersClient
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        lastLogin: u.lastLogin?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        createdBy: u.createdBy,
      }))}
      canManage={canManage}
      currentUserId={user.id}
    />
  )
}
