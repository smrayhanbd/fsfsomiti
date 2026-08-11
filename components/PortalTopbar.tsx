"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { signOut } from "next-auth/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Menu, Moon, Sun, Bell, User, Settings as SettingsIcon, LogOut,
  AlertCircle, CalendarClock, CheckCircle2, CheckCheck,
} from "lucide-react"
import { useMounted } from "@/lib/useMounted"
import { markAllMemberNotificationsRead } from "@/app/actions/notifications"
import { toast } from "sonner"

export interface PortalNotification {
  id: string
  type: "due" | "meeting" | "request" | "info"
  title: string
  message: string
  href?: string
  createdAt?: string
}

// Map the current top-level portal route to a friendly page title shown in the topbar.
function usePageTitle(): string {
  const pathname = usePathname()
  if (pathname === "/portal") return "Dashboard"
  if (pathname.startsWith("/portal/savings")) return "My Savings"
  if (pathname.startsWith("/portal/loans/apply")) return "Apply for Loan"
  if (pathname.startsWith("/portal/loans/")) return "Loan Details"
  if (pathname.startsWith("/portal/loans")) return "My Loans"
  if (pathname.startsWith("/portal/trust-score")) return "My Trust Score"
  if (pathname.startsWith("/portal/requests")) return "My Requests"
  if (pathname.startsWith("/portal/profile")) return "My Profile"
  if (pathname.startsWith("/portal/settings")) return "Settings"
  return "Member Portal"
}

function notifIcon(type: PortalNotification["type"]) {
  switch (type) {
    case "due": return <AlertCircle className="h-4 w-4 text-debit" />
    case "meeting": return <CalendarClock className="h-4 w-4 text-brand" />
    case "request": return <CheckCircle2 className="h-4 w-4 text-success" />
    default: return <Bell className="h-4 w-4 text-muted-ink" />
  }
}

function notifBg(type: PortalNotification["type"]) {
  switch (type) {
    case "due": return "bg-debit-soft"
    case "meeting": return "bg-info-soft"
    case "request": return "bg-success-soft"
    default: return "bg-subtle"
  }
}

export default function PortalTopbar({
  onMenuClick,
  memberId,
  memberName,
  memberNo,
  photoUrl,
  notifications = [],
}: {
  onMenuClick: () => void
  memberId?: string
  memberName?: string | null
  memberNo?: string | null
  photoUrl?: string | null
  notifications?: PortalNotification[]
}) {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const pageTitle = usePageTitle()
  const [marking, setMarking] = useState(false)

  const initials = (memberName || "M").trim().charAt(0).toUpperCase()
  const unread = notifications.length

  async function handleMarkAllRead() {
    if (!memberId || marking) return
    setMarking(true)
    const r = await markAllMemberNotificationsRead(memberId)
    setMarking(false)
    if (r.ok) {
      toast.success("All notifications marked as read.")
    } else {
      toast.error(r.error)
    }
  }

  return (
    <header className="glass relative z-40 flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onMenuClick} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate t-h3 text-primary-ink">{pageTitle}</h1>
          <p className="hidden truncate t-caption text-muted-ink sm:block">
            {memberNo ? `Member ID: ${memberNo}` : "Welcome back"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-9 w-9 rounded-[10px] hover:bg-subtle"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </Button>
        )}

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink outline-none cursor-pointer">
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--status-debit)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--status-debit)]" />
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-[var(--border-base)] px-3 py-2">
              <p className="t-overline text-muted-ink">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && <span className="text-xs font-bold text-debit">{unread} New</span>}
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    disabled={marking}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-gradient-soft disabled:opacity-50"
                    title="Mark all as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {marking ? "…" : "Mark all read"}
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <Bell className="h-7 w-7 text-faint-ink" />
                  <p className="t-body text-muted-ink">You&apos;re all caught up!</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-3 border-b border-[var(--border-base)] p-3 transition-colors last:border-0 hover:bg-subtle">
                      <div className={`mt-0.5 shrink-0 rounded-full p-1.5 ${notifBg(n.type)}`}>
                        {notifIcon(n.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="t-subheading text-primary-ink">{n.title}</p>
                        <p className="t-caption mt-0.5 leading-relaxed text-muted-ink">{n.message}</p>
                      </div>
                    </div>
                  )
                  return n.href ? (
                    <Link key={n.id} href={n.href}>{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  )
                })
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Avatar / account menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]">
            <Avatar className="h-9 w-9 ring-2 ring-[var(--border-base)] transition-shadow hover:ring-[var(--brand-primary)]">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={memberName || "Member"} className="h-full w-full rounded-full object-cover" />
              ) : (
                <AvatarFallback className="brand-gradient font-semibold text-white">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <p className="t-caption text-muted-ink">{memberNo || "Member Portal"}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href="/portal/profile" className="cursor-pointer" />}
            >
              <User className="mr-2 h-4 w-4" /> My Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href="/portal/settings" className="cursor-pointer" />}
            >
              <SettingsIcon className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/" })}
              className="cursor-pointer text-debit focus:text-debit"
            >
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
