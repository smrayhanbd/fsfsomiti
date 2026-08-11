"use client"

// Reactivate button (FRS §9.2). Admin/committee only.
// Calls the reactivateMember action and shows the result inline.

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PlayCircle, Loader2 } from "lucide-react"
import { reactivateMember } from "@/app/actions/trustScore"

export default function ReactivateButton({
  memberId,
  canReactivate,
  reason,
}: {
  memberId: string
  canReactivate: boolean
  reason?: string
}) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  const onClick = () => {
    if (!canReactivate) return
    if (!confirm("Reactivate this member? Their Trust Score will be fully recalculated.")) return
    startTransition(async () => {
      try {
        await reactivateMember(memberId)
        toast.success("Member reactivated. Trust Score recalculated.")
        setDone(true)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Reactivation failed.")
      }
    })
  }

  if (done) {
    return (
      <div className="mt-3 w-full rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2.5 text-center">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ Reactivated</p>
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={pending || !canReactivate}
      title={canReactivate ? "Reactivate member" : reason}
      className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
      {pending ? "Reactivating..." : "Reactivate Member"}
    </button>
  )
}
