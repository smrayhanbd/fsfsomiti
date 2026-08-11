"use client"

import { useState } from "react"
import AppSidebar from "@/components/AppSidebar"
import Topbar, { type TopbarNotification } from "@/components/Topbar"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import { PermissionProvider } from "@/lib/permissions/client"
import type { OrgInfo } from "@/lib/organization"

export default function DashboardClient({ children, notifications, permissions, org }: { children: React.ReactNode, notifications: TopbarNotification[], permissions: string[], org: OrgInfo }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <PermissionProvider permissions={permissions}>
      {/* h-screen + overflow-hidden keeps only the main scroll area scrolling. */}
      <div className="flex h-screen flex-col overflow-hidden bg-base">
        {/* Signature brand element — always at the very top */}
        <TrustRibbon />
        <div className="flex min-h-0 flex-1">
          <AppSidebar isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} org={org} />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar onMenuClick={() => setIsMobileOpen(true)} notifications={notifications} org={org} />

            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </PermissionProvider>
  )
}
