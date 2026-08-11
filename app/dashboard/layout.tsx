import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/permissions"
import { getPermissionsForClient } from "@/lib/permissions/resolver"
import { getOrganization } from "@/lib/organization"
import { redirect } from "next/navigation"
import DashboardClient from "./DashboardClient"

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Resolve the signed-in user's effective permissions once here (server-side)
  // and pass the serialized set to DashboardClient, which mounts the provider
  // so the sidebar + page guards can read it without further DB calls.
  // If the user is not signed in, redirect to the landing page — the middleware
  // also handles this, but the layout is the defense-in-depth backstop.
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }
  const permissions = await getPermissionsForClient(user.id)

  // Fetch unread notifications for the Topbar. Wrapped in try/catch so a
  // transient DB/pooler outage only blanks the notification badge instead of
  // taking down the whole dashboard route.
  let notifications: Array<{
    id: string
    type: string
    title: string
    message: string
    link: string | null
    isRead: boolean
    createdAt: Date
  }> = []
  try {
    notifications = await prisma.notification.findMany({
      where: { isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  } catch (error) {
    console.error("[dashboard/layout] Failed to load notifications:", error)
  }

  // Organization singleton (name/logo/tagline) feeds the sidebar + topbar.
  const org = await getOrganization()

  return <DashboardClient notifications={notifications} permissions={permissions} org={org}>{children}</DashboardClient>
}