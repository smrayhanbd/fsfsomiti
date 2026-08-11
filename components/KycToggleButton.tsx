"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react"
import { setMemberKyc } from "@/app/actions/member"

export default function KycToggleButton({ memberId, kycVerified }: { memberId: string; kycVerified: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [current, setCurrent] = useState(kycVerified)

  const handleClick = () => {
    const next = !current
    const verb = next ? "verify" : "revoke"
    if (!confirm(`Are you sure you want to ${verb} KYC for this member?`)) return
    startTransition(async () => {
      try {
        await setMemberKyc(memberId, next)
        setCurrent(next)
        toast.success(`KYC ${next ? "verified" : "revoked"} successfully.`)
      } catch (e: any) {
        toast.error("Could not update KYC", { description: e?.message || "Please try again." })
      }
    })
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      variant="outline"
      size="sm"
      className={`rounded-xl shadow-sm hover:shadow-md transition-all ${
        current
          ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 bg-slate-50 dark:bg-slate-900"
          : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 bg-slate-50 dark:bg-slate-900"
      }`}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : current ? (
        <ShieldX className="mr-2 h-4 w-4" />
      ) : (
        <ShieldCheck className="mr-2 h-4 w-4" />
      )}
      {isPending ? "Updating..." : current ? "Revoke KYC" : "Verify KYC"}
    </Button>
  )
}
