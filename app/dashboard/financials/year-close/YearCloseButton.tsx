"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBDT } from "@/lib/accounting"

/**
 * YearCloseButton — client component that POSTs to /api/financial-year/close
 * and renders a toast with the resulting journalEntryId + netIncome.
 *
 * Kept separate from the page.tsx server component because the close button
 * needs interactivity + transitions.
 */
export default function YearCloseButton({
  yearId,
  yearName,
}: {
  yearId: string
  yearName: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const handleClick = () => {
    if (
      !confirm(
        `Close financial year "${yearName}"?\n\nThis will post a year-end journal entry zeroing out every income and expense account and posting the net income to Retained Earnings. This CANNOT be undone.`
      )
    ) {
      return
    }
    setPending(true)
    fetch("/api/financial-year/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearId }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || "Close failed")
        }
        toast.success(`Year "${yearName}" closed`, {
          description: `Journal entry ${data.journalEntryId ?? "(none)"} posted. Net income: ${formatBDT(data.netIncome ?? 0)}.`,
        })
        router.refresh()
      })
      .catch((e: Error) => {
        toast.error("Could not close year", {
          description: e.message,
        })
      })
      .finally(() => setPending(false))
  }

  return (
    <Button
      onClick={handleClick}
      disabled={pending}
      variant="outline"
      className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Lock className="h-4 w-4 mr-2" />
      )}
      Close Year
    </Button>
  )
}
