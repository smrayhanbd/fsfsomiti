import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import NotificationsClient, { type NotificationItem } from "./NotificationsClient"

export const dynamic = "force-dynamic"

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  // Unread first, newest first within each group — mirrors how the bell
  // surfaces things and keeps actionable items at the top.
  const notifications = await prisma.notification.findMany({
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
  })

  const items: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }))

  return <NotificationsClient items={items} />
}
