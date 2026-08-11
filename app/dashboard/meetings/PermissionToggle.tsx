"use client"

// Single permission switch used by the Super Admin permissions panel. Calls
// grantMeetingPermission / revokeMeetingPermission. Optimistic on toggle.

import { useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { grantMeetingPermission, revokeMeetingPermission } from "@/app/actions/meeting"

export default function PermissionToggle({
  userId,
  permission,
  label,
  granted,
}: {
  userId: string
  permission: string
  label: string
  granted: boolean
}) {
  const [pending, startTransition] = useTransition()

  const toggle = (next: boolean) => {
    startTransition(async () => {
      try {
        if (next) await grantMeetingPermission(userId, permission)
        else await revokeMeetingPermission(userId, permission)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to update permission.")
      }
    })
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <Switch checked={granted} disabled={pending} onCheckedChange={toggle} />
      <span className="text-xs text-slate-600 dark:text-slate-300">{label}</span>
    </label>
  )
}
