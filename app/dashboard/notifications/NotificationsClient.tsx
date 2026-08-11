"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bell, AlertCircle, CreditCard, UserCog, CheckCheck, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { toast } from "sonner"
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications"

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  link?: string | null
  isRead: boolean
  createdAt: string
}

// Same visual language as the Topbar bell so a type reads the same in both.
function notifVisual(type: string) {
  switch (type) {
    case "MEMBER_REQUEST":
      return { Icon: CreditCard, wrap: "bg-rose-500/10", ink: "text-rose-500" }
    case "LOAN_REQUEST":
      return { Icon: CreditCard, wrap: "bg-indigo-500/10", ink: "text-indigo-500" }
    case "PROFILE_REQUEST":
      return { Icon: UserCog, wrap: "bg-sky-500/10", ink: "text-sky-500" }
    default:
      return { Icon: AlertCircle, wrap: "bg-warning-soft", ink: "text-warning" }
  }
}

// Compact relative time, formatted on the client to avoid SSR/locale hydration drift.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export default function NotificationsClient({ items }: { items: NotificationItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [localItems, setLocalItems] = useState<NotificationItem[]>(items)

  const unreadCount = localItems.filter((n) => !n.isRead).length

  const handleClick = (item: NotificationItem) => {
    // Optimistically mark read in the UI...
    setLocalItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
    )
    // ...persist, then navigate if there's a link.
    startTransition(() => {
      markNotificationRead(item.id).then((res) => {
        if (res.ok === false) {
          // Roll back on failure.
          setLocalItems((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, isRead: false } : n))
          )
          toast.error("Error", { description: res.error || "Could not mark as read." })
          return
        }
        if (item.link) router.push(item.link)
      })
    })
  }

  const handleMarkAll = () => {
    setLocalItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
    startTransition(async () => {
      const res = await markAllNotificationsRead()
      if (res.ok === false) {
        toast.error("Error", { description: res.error || "Could not mark all as read." })
        // Easiest correct recovery: refresh from the server.
        router.refresh()
      } else {
        toast.success("Marked all as read")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Notifications
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
              : "You're all caught up."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAll}
          disabled={unreadCount === 0}
          className="gap-2"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </div>

      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <ul className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
          {localItems.length === 0 ? (
            <li className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No notifications yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Member requests and system alerts will appear here.
              </p>
            </li>
          ) : (
            localItems.map((item) => {
              const { Icon, wrap, ink } = notifVisual(item.type)
              const clickable = !!item.link
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => handleClick(item)}
                    className={`flex w-full items-start gap-4 p-4 text-left transition-colors enabled:hover:bg-slate-50 dark:enabled:hover:bg-slate-800/40 disabled:cursor-default ${
                      item.isRead ? "opacity-70" : ""
                    }`}
                  >
                    <span className={`mt-0.5 shrink-0 rounded-full p-2 ${wrap}`}>
                      <Icon className={`h-4 w-4 ${ink}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="t-subheading truncate text-primary-ink">{item.title}</p>
                        {!item.isRead && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                        )}
                      </div>
                      <p className="t-body mt-0.5 text-muted-ink">{item.message}</p>
                      <p className="t-caption mt-1.5 text-muted-ink/80">{timeAgo(item.createdAt)}</p>
                    </div>
                    {clickable && (
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-ink" />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </Card>
    </div>
  )
}
