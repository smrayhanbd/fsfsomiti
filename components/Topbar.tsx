"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu, Moon, Sun, Bell, Search, User, Settings, LogOut, AlertCircle, ChevronDown, Building2, CreditCard, UserCog } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMounted } from "@/lib/useMounted"
import LanguageToggle from "@/components/somiti/LanguageToggle"
import OrgLogo from "@/components/somiti/OrgLogo"
import { markNotificationRead } from "@/app/actions/notifications"
import type { OrgInfo } from "@/lib/organization"

/** A topbar notification row — the subset of the Notification model we render. */
export interface TopbarNotification {
  id: string
  title: string
  message: string
  type?: string
  link?: string | null
}

// Pick an icon + tone per notification type so member-driven alerts stand out.
function notifVisual(type?: string) {
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

export default function Topbar({ onMenuClick, notifications = [], org }: { onMenuClick: () => void, notifications?: TopbarNotification[], org: OrgInfo }) {
  const mounted = useMounted()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Click a notification: persist read-state, then navigate to its link.
  // The bell refreshes on the next navigation (the layout is force-dynamic),
  // so the read item will no longer appear once we land on the target page.
  const handleNotifClick = (notif: TopbarNotification) => {
    if (!notif.link) return
    startTransition(() => {
      markNotificationRead(notif.id).finally(() => router.push(notif.link!))
    })
  }

  return (
    <header className="glass z-40 relative flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
      {/* Left: mobile menu, org selector, search */}
      <div className="flex flex-1 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>

        {/* Search */}
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
          <Input
            placeholder="Search members, ID, transactions…"
            className="h-9 rounded-[10px] border-[var(--border-base)] bg-[var(--control-bg)] pl-9 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-9 w-9 rounded-[10px] hover:bg-subtle"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </Button>
        )}

        <LanguageToggle compact />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink outline-none cursor-pointer">
            <Bell className="h-[18px] w-[18px]" />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--status-debit)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--status-debit)]" />
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between border-b border-[var(--border-base)] px-3 py-2">
              <p className="t-overline text-muted-ink">Notifications</p>
              {notifications.length > 0 && <span className="text-xs font-bold text-debit">{notifications.length} New</span>}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="t-body py-8 text-center text-muted-ink">No new notifications.</p>
              ) : (
                notifications.map((notif) => {
                  const { Icon, wrap, ink } = notifVisual(notif.type)
                  const clickable = !!notif.link
                  return (
                    <button
                      key={notif.id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => handleNotifClick(notif)}
                      className="flex w-full items-start gap-3 border-b border-[var(--border-base)] p-3 text-left transition-colors last:border-0 enabled:hover:bg-subtle disabled:cursor-default"
                    >
                      <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${wrap}`}>
                        <Icon className={`h-4 w-4 ${ink}`} />
                      </span>
                      <span className="flex-1">
                        <span className="t-subheading block text-primary-ink">{notif.title}</span>
                        <span className="t-caption mt-0.5 block text-muted-ink">{notif.message}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="t-body justify-center text-muted-ink focus:text-primary-ink"
              onClick={() => router.push("/dashboard/notifications")}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer">
            <Avatar className="h-9 w-9 ring-2 ring-[var(--border-base)] transition-shadow hover:ring-[var(--brand-primary)]">
              <AvatarFallback className="brand-gradient text-sm font-bold text-white">
                {session?.user?.email?.charAt(0).toUpperCase() || "A"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-xs font-bold text-muted-ink">{session?.user?.email || "Admin"}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2.5" onClick={() => router.push("/dashboard/profile")}><User className="h-4 w-4" /> Profile</DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5" onClick={() => router.push("/dashboard/settings/organization")}><Settings className="h-4 w-4" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="gap-2.5 text-debit focus:text-debit">
              <LogOut className="h-4 w-4" /> Exit / Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
