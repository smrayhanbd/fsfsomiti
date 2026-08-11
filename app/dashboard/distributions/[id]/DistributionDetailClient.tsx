"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ArrowLeft, BookOpen, PieChart, Send, Undo2 } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import SharePreviewTable from "@/components/distribution/SharePreviewTable"
import { formatBDT } from "@/components/somiti/Money"
import { postDistributionAction, reverseDistributionAction } from "@/app/actions/distribution"
import {
  BASIS_LABELS,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/distribution/types"

// Plain serializable shape (Decimals → numbers) from the server page.
export interface DistributionDetailData {
  id: string
  distributionNo: string
  sourceType: "INVESTMENT" | "PROJECT" | "GENERAL"
  basis: "PRO_RATA" | "EQUAL" | "MANUAL"
  status: "DRAFT" | "POSTED" | "REVERSED"
  title: string
  description: string | null
  snapshotDate: string
  totalDistributable: number
  eligibleFund: number
  memberCount: number
  postedAt: string | null
  postedByName: string | null
  reversalReason: string | null
  reversedAt: string | null
  investment: { id: string; investmentNo: string; name: string } | null
  project: { id: string; projectNo: string; name: string } | null
  shares: {
    id: string
    memberNo: string
    memberName: string
    fundAtSnapshot: number
    weight: number
    amount: number
  }[]
  journalEntry: {
    voucherNo: string
    entryDate: string
    narration: string
    lines: { accountName: string; accountCode: string; debit: number; credit: number; memo: string | null }[]
  } | null
  reversalJournal: { voucherNo: string; entryDate: string; narration: string } | null
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-800",
  POSTED: "bg-emerald-100 text-emerald-800",
  REVERSED: "bg-rose-100 text-rose-800",
}

export default function DistributionDetailClient({ distribution }: { distribution: DistributionDetailData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showReverse, setShowReverse] = useState(false)
  const [reason, setReason] = useState("")

  const handlePost = () => {
    startTransition(async () => {
      const res = await postDistributionAction(distribution.id)
      if (!res.ok) { toast.error("Could not post", { description: res.error }); return }
      toast.success("Distribution posted", { description: res.voucherNo })
      router.refresh()
    })
  }

  const handleReverse = () => {
    if (!reason.trim()) return toast.error("A reason is required to reverse.")
    startTransition(async () => {
      const res = await reverseDistributionAction(distribution.id, reason)
      if (!res.ok) { toast.error("Could not reverse", { description: res.error }); return }
      toast.success("Distribution reversed", { description: res.voucherNo })
      setShowReverse(false)
      setReason("")
      router.refresh()
    })
  }

  const d = distribution
  const sourceHref = d.investment
    ? `/dashboard/investments/${d.investment.id}`
    : d.project
      ? `/dashboard/projects/${d.project.id}`
      : "/dashboard/distributions"

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={d.title}
        subtitle={`${d.distributionNo} · ${SOURCE_TYPE_LABELS[d.sourceType]}`}
        actions={
          <Link href="/dashboard/distributions">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> All Distributions</Button>
          </Link>
        }
      />

      {/* Status & summary strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-base)] bg-subtle/40 px-4 py-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[d.status]}`}>
          {STATUS_LABELS[d.status]}
        </span>
        <span className="t-caption text-muted-ink">Basis: <strong>{BASIS_LABELS[d.basis]}</strong></span>
        <span className="t-caption text-muted-ink">Snapshot: <strong>{new Date(d.snapshotDate).toLocaleDateString()}</strong></span>
        <span className="t-caption text-muted-ink">Members: <strong>{d.memberCount}</strong></span>
        <span className="t-caption text-muted-ink">Eligible fund: <strong>{formatBDT(d.eligibleFund)}</strong></span>
        <span className="ml-auto t-num font-bold text-brand">{formatBDT(d.totalDistributable)}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Member shares */}
          <SectionCard title="Member Shares" icon={<PieChart />} accent="emerald" bodyClassName="p-4">
            <SharePreviewTable
              rows={d.shares.map((s) => ({
                memberNo: s.memberNo,
                memberName: s.memberName,
                fundAtSnapshot: s.fundAtSnapshot,
                weight: s.weight,
                amount: s.amount,
              }))}
              totalDistributable={d.totalDistributable}
              compact
            />
          </SectionCard>

          {/* Voucher (if posted) */}
          {d.journalEntry && (
            <SectionCard title="Posted Voucher" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="t-overline text-muted-ink">{d.journalEntry.voucherNo}</span>
                <span className="t-caption text-muted-ink">{new Date(d.journalEntry.entryDate).toLocaleString()}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
                <table className="w-full text-sm">
                  <thead><tr className="bg-subtle/60">
                    <th className="t-overline px-3 py-2 text-left text-muted-ink">Account</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Dr</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Cr</th>
                  </tr></thead>
                  <tbody>
                    {d.journalEntry.lines.map((l, i) => (
                      <tr key={i} className="border-t border-[var(--border-base)]">
                        <td className="t-caption px-3 py-2 text-secondary-ink">{l.accountName}</td>
                        <td className="t-num px-3 py-2 text-right">{l.debit > 0 ? formatBDT(l.debit) : "—"}</td>
                        <td className="t-num px-3 py-2 text-right">{l.credit > 0 ? formatBDT(l.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 t-caption text-muted-ink">{d.journalEntry.narration}</p>
            </SectionCard>
          )}

          {/* Reversal (if reversed) */}
          {d.reversalJournal && (
            <SectionCard title="Reversal Voucher" icon={<Undo2 />} accent="crimson" bodyClassName="p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="t-overline text-muted-ink">{d.reversalJournal.voucherNo}</span>
                <span className="t-caption text-muted-ink">{new Date(d.reversalJournal.entryDate).toLocaleString()}</span>
              </div>
              <p className="t-caption text-secondary-ink">{d.reversalJournal.narration}</p>
              {d.reversalReason && <p className="mt-1 t-caption text-muted-ink">Reason: {d.reversalReason}</p>}
            </SectionCard>
          )}
        </div>

        {/* Right rail: actions & meta */}
        <div className="space-y-6">
          <SectionCard title="Actions" icon={<Send />} accent="emerald" bodyClassName="p-4 space-y-3">
            {d.status === "DRAFT" && (
              <Button className="w-full brand-gradient shadow-brand-glow" disabled={isPending} onClick={handlePost}>
                {isPending ? "Posting…" : <><Send className="mr-2 h-4 w-4" /> Post Distribution</>}
              </Button>
            )}
            {d.status === "POSTED" && !showReverse && (
              <Button variant="outline" className="w-full" disabled={isPending} onClick={() => setShowReverse(true)}>
                <Undo2 className="mr-2 h-4 w-4" /> Reverse this distribution
              </Button>
            )}
            {d.status === "POSTED" && showReverse && (
              <div className="space-y-2">
                <Label>Reason for reversal <span className="text-debit">*</span></Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Wrong snapshot date" className="bg-[var(--control-bg)]" />
                <div className="flex gap-2">
                  <Button variant="destructive" className="flex-1" disabled={isPending} onClick={handleReverse}>
                    {isPending ? "Reversing…" : "Confirm Reverse"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowReverse(false); setReason("") }}>Cancel</Button>
                </div>
              </div>
            )}
            {d.status === "REVERSED" && (
              <p className="t-caption text-muted-ink">This distribution has been reversed. Member balances were restored.</p>
            )}
            <Link href={sourceHref} className="block">
              <Button variant="ghost" className="w-full">View source {d.investment ? "investment" : d.project ? "project" : ""}</Button>
            </Link>
          </SectionCard>

          <SectionCard title="Details" icon={<BookOpen />} accent="violet" bodyClassName="p-4 space-y-1.5">
            {d.investment && (
              <div className="flex justify-between t-caption">
                <span className="text-muted-ink">Investment</span>
                <span className="text-secondary-ink">{d.investment.investmentNo}</span>
              </div>
            )}
            {d.project && (
              <div className="flex justify-between t-caption">
                <span className="text-muted-ink">Project</span>
                <span className="text-secondary-ink">{d.project.projectNo}</span>
              </div>
            )}
            {d.postedAt && (
              <div className="flex justify-between t-caption">
                <span className="text-muted-ink">Posted</span>
                <span className="text-secondary-ink">{new Date(d.postedAt).toLocaleString()} by {d.postedByName ?? "—"}</span>
              </div>
            )}
            {d.reversedAt && (
              <div className="flex justify-between t-caption">
                <span className="text-muted-ink">Reversed</span>
                <span className="text-secondary-ink">{new Date(d.reversedAt).toLocaleString()}</span>
              </div>
            )}
            {d.description && (
              <div className="border-t border-[var(--border-base)] pt-2">
                <p className="t-caption text-muted-ink">{d.description}</p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
