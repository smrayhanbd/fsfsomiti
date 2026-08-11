"use client"

// The "Distribute" tab on an investment detail page. Shows how much recorded
// income has not yet been distributed, plus recent distributions for this
// investment, and links into DistributionBuilder pre-filled for it.

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PieChart, Send } from "lucide-react"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { getUndistributedInvestmentIncome } from "@/app/actions/distribution"
import { STATUS_LABELS } from "@/lib/distribution/types"

interface Props {
  investmentId: string
  investmentNo: string
  name: string
  investmentDate: string
  totalIncome: number
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800",
  POSTED: "bg-emerald-100 text-emerald-800",
  REVERSED: "bg-rose-100 text-rose-800",
}

export default function InvestmentDistributeTab({
  investmentId, investmentNo, name, investmentDate, totalIncome,
}: Props) {
  const [undistributed, setUndistributed] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Refresh the undistributed total whenever the tab mounts or the
    // investment's income changes (router.refresh re-mounts the page).
    startTransition(async () => {
      const v = await getUndistributedInvestmentIncome(investmentId)
      setUndistributed(v)
    })
  }, [investmentId, totalIncome])

  const canDistribute = (undistributed ?? 0) > 0

  return (
    <SectionCard title="Distribute Income" icon={<PieChart />} accent="emerald" bodyClassName="p-5 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-base)] bg-subtle/40 px-4 py-3">
          <p className="t-caption text-muted-ink">Total income recorded</p>
          <p className="t-num text-lg font-bold text-primary-ink">{formatBDT(totalIncome)}</p>
        </div>
        <div className="rounded-xl border border-[var(--border-base)] bg-emerald-50 px-4 py-3">
          <p className="t-caption text-muted-ink">Undistributed</p>
          <p className="t-num text-lg font-bold text-brand">
            {undistributed === null ? "…" : formatBDT(undistributed)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-base)] bg-subtle/40 px-4 py-3">
          <p className="t-caption text-muted-ink">Snapshot date</p>
          <p className="t-body font-semibold text-primary-ink">
            {new Date(investmentDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-base)] px-4 py-3">
        <p className="t-body text-secondary-ink">
          Distribute this investment&apos;s income to members based on their fund share on the
          investment date. Members who joined after <strong>{new Date(investmentDate).toLocaleDateString()}</strong> are
          excluded from this distribution.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/distributions/new?investmentId=${investmentId}`}>
          <Button className="brand-gradient shadow-brand-glow" disabled={!canDistribute}>
            <Send className="mr-2 h-4 w-4" />
            {canDistribute ? `Distribute ${formatBDT(undistributed ?? 0)}` : "Nothing to distribute"}
          </Button>
        </Link>
        <Link href={`/dashboard/distributions?sourceType=INVESTMENT`}>
          <Button variant="outline">View all investment distributions</Button>
        </Link>
      </div>

      {!canDistribute && undistributed !== null && (
        <p className="t-caption text-muted-ink">
          All recorded income for {investmentNo} ({name}) has already been distributed.
        </p>
      )}
    </SectionCard>
  )
}

export { STATUS_TONE, STATUS_LABELS }
