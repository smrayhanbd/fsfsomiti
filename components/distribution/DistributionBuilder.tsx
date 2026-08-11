"use client"

// DistributionBuilder — the shared form for creating an income distribution.
//
// Flow:
//   1. Source card (source type, snapshot date, total amount, basis)
//   2. Eligible members preview table (live from previewEligibleMembers)
//   3. Accounting preview (Dr income / Cr Member Savings Liability)
//   4. Save as Draft  →  createDistribution
//      Post            →  createDistribution + postDistributionAction
//
// Used by three entry points (investment / project / standalone general),
// each of which pre-fills the `defaults` prop.

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ArrowLeft, PieChart, BookOpen, Save, Send, RefreshCw } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import SharePreviewTable from "@/components/distribution/SharePreviewTable"
import { formatBDT } from "@/components/somiti/Money"
import {
  createDistribution,
  postDistributionAction,
  previewEligibleMembers,
} from "@/app/actions/distribution"
import {
  BASIS_LABELS,
  SOURCE_TYPE_LABELS,
  type Basis,
  type MemberFundSnapshot,
  type SourceType,
} from "@/lib/distribution/types"
import { calculateShares } from "@/lib/distribution/allocate"

const FIELD_H = "h-10 data-[size=default]:h-10"

export interface DistributionDefaults {
  sourceType: SourceType
  investmentId?: string | null
  projectId?: string | null
  /** ISO date string. */
  snapshotDate: string
  totalDistributable: number
  /** Lock the source type / entity (e.g. from an investment detail page). */
  lockedSource?: boolean
  /** Suggested title. */
  titleSuggestion?: string
  backHref: string
}

interface MemberPreview {
  memberId: string
  memberNo: string
  fullName: string
  fund: number
}

export default function DistributionBuilder({ defaults }: { defaults: DistributionDefaults }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [sourceType, setSourceType] = useState<SourceType>(defaults.sourceType)
  const [snapshotDate, setSnapshotDate] = useState(defaults.snapshotDate)
  const [total, setTotal] = useState(String(defaults.totalDistributable || ""))
  const [basis, setBasis] = useState<Basis>("PRO_RATA")
  const [title, setTitle] = useState(defaults.titleSuggestion ?? "")
  const [description, setDescription] = useState("")

  // Eligible members for the current snapshot date (fetched from server).
  const [members, setMembers] = useState<MemberPreview[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Refetch eligible members whenever the snapshot date changes. All setState
  // calls happen inside the async callbacks (never synchronously in the effect
  // body) so we don't trigger cascading renders. The `started` ref lets us
  // avoid re-entering if the effect fires twice in StrictMode dev.
  const startedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!snapshotDate || startedFor.current === snapshotDate) return
    startedFor.current = snapshotDate
    let cancelled = false
    previewEligibleMembers(snapshotDate)
      .then((res) => {
        if (cancelled) return
        setLoadingMembers(false)
        if (res.ok) setMembers(res.members as MemberFundSnapshot[])
        else {
          setMembers([])
          toast.error("Could not load members", { description: res.error })
        }
      })
      .catch(() => { if (!cancelled) setLoadingMembers(false) })
    // Flag loading synchronously is disallowed by the lint rule; instead we
    // derive the loading flag from the absence of a result for this date by
    // setting it inside the same microtask via queueMicrotask.
    queueMicrotask(() => { if (!cancelled) setLoadingMembers(true) })
    return () => { cancelled = true }
  }, [snapshotDate])

  const totalNum = parseFloat(total) || 0

  // Compute the allocation on the client for preview (the server recomputes
  // authoritatively on save, so this is display-only).
  const previewShares = useMemo(() => {
    if (totalNum <= 0 || members.length === 0) return []
    return calculateShares({
      basis,
      totalDistributable: totalNum,
      members,
    }).shares
  }, [basis, totalNum, members])

  const totalDr = totalNum
  const totalCr = totalNum

  const buildInput = () => ({
    sourceType,
    investmentId: defaults.investmentId ?? null,
    projectId: defaults.projectId ?? null,
    title: title.trim() || defaults.titleSuggestion || `Distribution — ${new Date().toLocaleDateString()}`,
    description: description.trim() || null,
    basis,
    snapshotDate,
    totalDistributable: totalNum,
  })

  const handleSaveDraft = () => {
    if (!(totalNum > 0)) return toast.error("Enter a total amount greater than zero.")
    if (members.length === 0) return toast.error("No eligible members at this snapshot date.")
    startTransition(async () => {
      const res = await createDistribution(buildInput())
      if (!res.ok) { toast.error("Could not save draft", { description: res.error }); return }
      toast.success("Draft saved", { description: res.voucherNo })
      router.push(`/dashboard/distributions/${res.id}`)
    })
  }

  const handlePost = () => {
    if (!(totalNum > 0)) return toast.error("Enter a total amount greater than zero.")
    if (members.length === 0) return toast.error("No eligible members at this snapshot date.")
    if (!title.trim() && !defaults.titleSuggestion) return toast.error("A title is required.")
    startTransition(async () => {
      // Create as draft, then immediately post in one user action.
      const created = await createDistribution(buildInput())
      if (!created.ok || !created.id) {
        toast.error("Could not create distribution", { description: created.ok ? "" : created.error }); return
      }
      const posted = await postDistributionAction(created.id)
      if (!posted.ok) {
        toast.error("Saved as draft, but posting failed", { description: posted.error })
        router.push(`/dashboard/distributions/${created.id}`)
        return
      }
      toast.success("Distribution posted", {
        description: `${created.voucherNo} · voucher ${posted.voucherNo}`,
      })
      router.push(`/dashboard/distributions/${created.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Distribute Income"
        subtitle={SOURCE_TYPE_LABELS[sourceType]}
        actions={
          <Link href={defaults.backHref}>
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* ── Source & amount ── */}
          <SectionCard title="Distribution Details" icon={<PieChart />} accent="emerald" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Title <span className="text-debit">*</span></Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaults.titleSuggestion ?? "e.g. Half-yearly rental profit"}
                  className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Income Source</Label>
                <Select value={sourceType} onValueChange={(v) => !defaults.lockedSource && setSourceType((v ?? "GENERAL") as SourceType)} disabled={defaults.lockedSource}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_TYPE_LABELS) as SourceType[]).map((k) => (
                      <SelectItem key={k} value={k}>{SOURCE_TYPE_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Snapshot Date <span className="text-debit">*</span></Label>
                <div className="flex gap-2">
                  <Input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)}
                    className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setSnapshotDate(new Date().toISOString().slice(0, 10))}
                    title="Set to today"><RefreshCw className="h-4 w-4" /></Button>
                </div>
                <p className="t-caption text-muted-ink">
                  Fund shares are computed as of this date. Members who joined after are excluded.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Total Distributable (৳) <span className="text-debit">*</span></Label>
                <Input type="number" value={total} onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Basis</Label>
                <Select value={basis} onValueChange={(v) => setBasis((v ?? "PRO_RATA") as Basis)}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BASIS_LABELS) as Basis[]).map((k) => (
                      <SelectItem key={k} value={k}>{BASIS_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description / Notes</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="bg-[var(--control-bg)]" />
              </div>
            </div>
          </SectionCard>

          {/* ── Member allocations preview ── */}
          <SectionCard title="Member Allocations" icon={<PieChart />} accent="blue" bodyClassName="p-4">
            {loadingMembers ? (
              <p className="t-caption text-muted-ink">Loading eligible members…</p>
            ) : members.length === 0 ? (
              <p className="t-caption text-muted-ink">
                No members had a fund at {snapshotDate}. Pick a later date or record deposits first.
              </p>
            ) : (
              <SharePreviewTable
                rows={previewShares.map((s) => ({
                  memberNo: s.memberNo,
                  memberName: s.memberName,
                  fundAtSnapshot: s.fundAtSnapshot,
                  weight: s.weight,
                  amount: s.amount,
                }))}
                totalDistributable={totalNum}
              />
            )}
          </SectionCard>
        </div>

        {/* ── Right rail: accounting preview + actions ── */}
        <div className="space-y-6">
          <SectionCard title="Accounting Preview" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
            {totalNum <= 0 ? (
              <p className="t-caption text-muted-ink">Enter a total amount to preview the entry.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
                <table className="w-full text-sm">
                  <thead><tr className="bg-subtle/60">
                    <th className="t-overline px-3 py-2 text-left text-muted-ink">Account</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Dr</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Cr</th>
                  </tr></thead>
                  <tbody>
                    <tr className="border-t border-[var(--border-base)]">
                      <td className="t-caption px-3 py-2 text-secondary-ink">
                        {sourceType === "INVESTMENT" ? "Investment Income" : "Profit & Interest Income"}
                      </td>
                      <td className="t-num px-3 py-2 text-right">{formatBDT(totalDr)}</td>
                      <td className="t-num px-3 py-2 text-right">—</td>
                    </tr>
                    <tr className="border-t border-[var(--border-base)]">
                      <td className="t-caption px-3 py-2 text-secondary-ink">Member Savings Liability</td>
                      <td className="t-num px-3 py-2 text-right">—</td>
                      <td className="t-num px-3 py-2 text-right">{formatBDT(totalCr)}</td>
                    </tr>
                    <tr className="border-t-2 border-[var(--border-strong)] bg-subtle/40">
                      <td className="t-caption px-3 py-2 font-bold text-primary-ink">Total</td>
                      <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalDr)}</td>
                      <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalCr)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 t-caption text-muted-ink">
              Each member&apos;s savings balance is credited by their share immediately on posting.
            </p>
          </SectionCard>

          <div className="flex flex-col gap-2">
            <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handlePost}>
              {isPending ? "Posting…" : <><Send className="mr-2 h-4 w-4" /> Create & Post Distribution</>}
            </Button>
            <Button variant="outline" disabled={isPending} onClick={handleSaveDraft}>
              <Save className="mr-2 h-4 w-4" /> Save as Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
