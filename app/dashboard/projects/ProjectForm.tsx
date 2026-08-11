"use client"

import { useMemo, useState, useTransition } from "react"
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
import {
  Save, X, FileText, Briefcase, Users, Calendar, Coins, TrendingUp,
  Target, Link2, BookOpen, Plus, Trash2,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { saveProject } from "@/app/actions/projects"
import type { CostCenterInput, MilestoneInput } from "@/app/actions/projects"
import {
  PROJECT_TYPE_LABELS, PROJECT_PHASE_LABELS, BUDGET_SOURCE_LABELS, MILESTONE_STATUS_LABELS,
  type ProjectType, type ProjectPhase, type BudgetSource, type MilestoneStatus,
} from "@/lib/portfolio/types"

const FIELD_H = "h-10 data-[size=default]:h-10"

interface MemberOption { id: string; fullName: string; memberNo: string }
interface AccountOption { id: string; accountCode: string; accountName: string; accountType: string; isCash: boolean; isBank: boolean; currentBalance: number }
interface BankOption { id: string; accountName: string; bankName: string | null }
interface InvestmentOption { id: string; name: string; amount: number }

interface ProjectData {
  id: string
  name: string
  type: ProjectType
  code: string | null
  description: string | null
  tags: string[]
  plannedStartDate: string | null
  plannedEndDate: string | null
  actualStartDate: string | null
  phase: ProjectPhase
  managerMemberId: string | null
  sponsorMemberId: string | null
  teamMembers: Array<{ id: string; name: string }>
  externalContractors: string | null
  totalBudget: number
  budgetSource: BudgetSource
  revenuePlan: { expectedRevenue?: number; revenueType?: string; expectedProfit?: number; expectedMarginPct?: number }
  revenueAccountId: string | null
  expenseAccountId: string | null
  wipAssetAccountId: string | null
  bankAccountId: string | null
  status: string
  costCenters: Array<{ id?: string; name: string; budgetAmount: number }>
  milestones: Array<{ id?: string; name: string; targetDate?: string | null; status?: MilestoneStatus; value?: number | null; notes?: string | null }>
}

interface Props {
  mode: "create" | "edit"
  members: MemberOption[]
  accounts: AccountOption[]
  bankAccounts: BankOption[]
  investments: InvestmentOption[]
  linkInvestmentId: string | null
  project: ProjectData | null
}

const TYPE_OPTIONS = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]
const DEFAULT_COST_CENTERS = [
  "Land / Property Acquisition", "Construction / Civil Work", "Materials & Supplies",
  "Labor / Wages", "Professional Fees", "Marketing & Sales", "Utilities & Overheads", "Contingency Reserve", "Administrative Expenses",
]
const REVENUE_TYPES = ["Plot Sales", "Rent", "Product Sales", "Service Fees", "Other"]

export default function ProjectForm({ mode, members, accounts, bankAccounts, investments, linkInvestmentId, project }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // When arriving via ?investment=<id> the create page passes a single
  // investment (with its cost basis) so we can pre-fill name + budget.
  const linkedInv = mode === "create" && investments.length > 0 ? investments[0] : null

  // Section 1 — Identity
  const [name, setName] = useState(project?.name ?? (linkedInv ? `${linkedInv.name} — Project` : ""))
  const [type, setType] = useState<ProjectType>(project?.type ?? "REAL_ESTATE")
  const [code, setCode] = useState(project?.code ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(project?.tags ?? [])

  // Section 2 — Timeline
  const [plannedStartDate, setPlannedStartDate] = useState(project?.plannedStartDate?.slice(0, 10) ?? "")
  const [plannedEndDate, setPlannedEndDate] = useState(project?.plannedEndDate?.slice(0, 10) ?? "")
  const [actualStartDate, setActualStartDate] = useState(project?.actualStartDate?.slice(0, 10) ?? "")
  const [phase, setPhase] = useState<ProjectPhase>(project?.phase ?? "PLANNING")

  // Section 3 — Team
  const [managerMemberId, setManagerMemberId] = useState(project?.managerMemberId ?? "")
  const [sponsorMemberId, setSponsorMemberId] = useState(project?.sponsorMemberId ?? "")
  const [externalContractors, setExternalContractors] = useState(project?.externalContractors ?? "")

  // Section 4 — Budget
  const [totalBudget, setTotalBudget] = useState(
    project ? project.totalBudget.toString() : (linkedInv && linkedInv.amount ? String(linkedInv.amount) : "")
  )
  const [budgetSource, setBudgetSource] = useState<BudgetSource>(project?.budgetSource ?? (linkedInv ? "INVESTMENT" : "SOMITI_FUND"))
  const [costCenters, setCostCenters] = useState<CostCenterInput[]>(
    project?.costCenters?.length ? project.costCenters : DEFAULT_COST_CENTERS.slice(0, 4).map((n) => ({ name: n, budgetAmount: 0 }))
  )

  // Section 5 — Revenue plan
  const [expectedRevenue, setExpectedRevenue] = useState(project?.revenuePlan?.expectedRevenue?.toString() ?? "")
  const [revenueType, setRevenueType] = useState(project?.revenuePlan?.revenueType ?? "")

  // Section 6 — Milestones
  const [milestones, setMilestones] = useState<MilestoneInput[]>(
    project?.milestones?.length ? project.milestones : [{ name: "", targetDate: null, status: "NOT_STARTED" }]
  )

  // Section 7 — Linked investment (read-only if passed via query)
  const [linkInvestment, setLinkInvestment] = useState(!!linkInvestmentId)

  // Section 8 — Accounting
  const [revenueAccountId, setRevenueAccountId] = useState(project?.revenueAccountId ?? "")
  const [expenseAccountId, setExpenseAccountId] = useState(project?.expenseAccountId ?? "")
  const [wipAssetAccountId, setWipAssetAccountId] = useState(project?.wipAssetAccountId ?? "")
  const [bankAccountId, setBankAccountId] = useState(project?.bankAccountId ?? "")

  // ── Derived ──
  const budgetNum = parseFloat(totalBudget) || 0
  const revenueNum = parseFloat(expectedRevenue) || 0
  const expectedProfit = revenueNum - budgetNum
  const expectedMarginPct = revenueNum > 0 ? (expectedProfit / revenueNum) * 100 : 0
  const ccTotal = costCenters.reduce((s, c) => s + (Number(c.budgetAmount) || 0), 0)

  const durationDays = useMemo(() => {
    if (!plannedStartDate || !plannedEndDate) return null
    const diff = new Date(plannedEndDate).getTime() - new Date(plannedStartDate).getTime()
    return diff > 0 ? Math.round(diff / 86400000) : null
  }, [plannedStartDate, plannedEndDate])

  // ── Handlers ──
  const addTag = () => { const t = tagInput.trim(); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput("") }
  const updateCostCenter = (i: number, field: keyof CostCenterInput, value: string) => {
    setCostCenters((ccs) => ccs.map((c, idx) => idx === i ? { ...c, [field]: field === "budgetAmount" ? Number(value) || 0 : value } : c))
  }
  const updateMilestone = (i: number, field: keyof MilestoneInput, value: string) => {
    setMilestones((ms) => ms.map((m, idx) => idx === i ? { ...m, [field]: field === "value" ? Number(value) || null : value } : m))
  }

  const handleSave = () => {
    if (!name.trim()) return toast.error("Project name is required.")
    if (!(budgetNum > 0)) return toast.error("Total budget must be greater than zero.")
    const validCostCenters = costCenters.filter((c) => c.name?.trim())
    if (validCostCenters.length === 0) return toast.error("Add at least one cost center.")

    startTransition(async () => {
      const res = await saveProject({
        id: mode === "edit" ? project?.id : undefined,
        name: name.trim(),
        type,
        code: code || null,
        description: description || null,
        tags,
        plannedStartDate: plannedStartDate || null,
        plannedEndDate: plannedEndDate || null,
        actualStartDate: actualStartDate || null,
        phase,
        managerMemberId: managerMemberId || null,
        sponsorMemberId: sponsorMemberId || null,
        teamMembers: [],
        externalContractors: externalContractors || null,
        totalBudget: budgetNum,
        budgetSource,
        costCenters: validCostCenters,
        revenuePlan: { expectedRevenue: revenueNum, revenueType, expectedProfit, expectedMarginPct },
        revenueAccountId: revenueAccountId || undefined,
        expenseAccountId: expenseAccountId || undefined,
        wipAssetAccountId: wipAssetAccountId || null,
        bankAccountId: bankAccountId || null,
        milestones: milestones.filter((m) => m.name?.trim()),
        status: "PLANNING",
        linkInvestmentId: linkInvestment && linkInvestmentId ? linkInvestmentId : null,
      })
      if (!res.ok) { toast.error("Could not save project", { description: res.error }); return }
      toast.success("Project saved")
      router.push("/dashboard/projects")
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-8.1875rem)] lg:gap-4">
      <PageHeader
        className="lg:shrink-0"
        title={mode === "edit" ? "Edit Project" : "New Project"}
        subtitle="Define an operational venture — budget, cost centers, team, milestones & accounting setup."
        actions={<Link href="/dashboard/projects"><Button variant="outline"><X className="mr-2 h-4 w-4" /> Cancel</Button></Link>}
      />

      <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
        {/* ═══ LEFT (2 cols) ═══ */}
        <div className="space-y-6 lg:col-span-2 lg:min-h-0 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
          {/* Section 1 — Identity */}
          <SectionCard title="Project Identity" icon={<Briefcase />} accent="blue" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Project Name <span className="text-debit">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Green Housing Project" className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Project Type <span className="text-debit">*</span></Label>
                <Select value={type} onValueChange={(v) => setType((v ?? "REAL_ESTATE") as ProjectType)}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Short code (optional)" className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Description / Scope</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-[var(--control-bg)]" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder="Type a tag and press enter" className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  <Button type="button" variant="outline" onClick={addTag}><Plus className="h-4 w-4" /></Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 t-caption text-secondary-ink hover:bg-debit-soft hover:text-debit">{t} <X className="h-3 w-3" /></button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Section 2 — Timeline */}
          <SectionCard title="Timeline" icon={<Calendar />} accent="violet" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Planned Start Date</Label><Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Planned End Date</Label><Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Actual Start Date</Label><Input type="date" value={actualStartDate} onChange={(e) => setActualStartDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5">
                <Label>Project Phase</Label>
                <Select value={phase} onValueChange={(v) => setPhase((v ?? "PLANNING") as ProjectPhase)}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(PROJECT_PHASE_LABELS) as ProjectPhase[]).map((p) => <SelectItem key={p} value={p}>{PROJECT_PHASE_LABELS[p]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {durationDays != null && (
                <div className="sm:col-span-2 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-2 t-caption text-muted-ink">
                  Expected duration: <span className="font-bold text-brand">{durationDays} days</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Section 3 — Team */}
          <SectionCard title="Team" icon={<Users />} accent="gold" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Project Manager</Label>
                <Select value={managerMemberId} onValueChange={(v) => setManagerMemberId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select member" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.fullName} ({m.memberNo})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project Sponsor</Label>
                <Select value={sponsorMemberId} onValueChange={(v) => setSponsorMemberId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select member" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.fullName} ({m.memberNo})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>External Contractors</Label>
                <Textarea value={externalContractors} onChange={(e) => setExternalContractors(e.target.value)} rows={2} placeholder="Optional — list names" className="bg-[var(--control-bg)]" />
              </div>
            </div>
          </SectionCard>

          {/* Section 4 — Budget + Cost Centers */}
          <SectionCard title="Budget & Cost Centers" icon={<Coins />} accent="emerald" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Total Approved Budget (৳) <span className="text-debit">*</span></Label>
                <Input type="number" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Budget Source</Label>
                <Select value={budgetSource} onValueChange={(v) => setBudgetSource((v ?? "SOMITI_FUND") as BudgetSource)}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(BUDGET_SOURCE_LABELS) as BudgetSource[]).map((b) => <SelectItem key={b} value={b}>{BUDGET_SOURCE_LABELS[b]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {/* Cost center rows */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cost Centers</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setCostCenters([...costCenters, { name: "", budgetAmount: 0 }])}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Row</Button>
              </div>
              {costCenters.map((cc, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <Select value={cc.name} onValueChange={(v) => updateCostCenter(i, "name", v ?? "")}>
                      <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}>
                        <SelectValue placeholder="Select or type cost center" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_COST_CENTERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input type="number" value={cc.budgetAmount || ""} onChange={(e) => updateCostCenter(i, "budgetAmount", e.target.value)} placeholder="Budget" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-debit" onClick={() => setCostCenters(costCenters.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2 t-caption text-muted-ink">
                <span>Cost-center budget total</span>
                <span className={`t-num font-semibold ${Math.abs(ccTotal - budgetNum) < 0.01 ? "text-success" : "text-warning"}`}>{formatBDT(ccTotal)}</span>
              </div>
            </div>
          </SectionCard>

          {/* Section 5 — Revenue Plan */}
          <SectionCard title="Revenue Plan" icon={<TrendingUp />} accent="emerald" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Expected Total Revenue (৳)</Label>
                <Input type="number" value={expectedRevenue} onChange={(e) => setExpectedRevenue(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Revenue Type</Label>
                <Select value={revenueType} onValueChange={(v) => setRevenueType(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{REVENUE_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3">
                <div className="flex justify-between t-caption text-muted-ink"><span>Expected Profit</span><span className={`t-num font-bold ${expectedProfit >= 0 ? "t-num-pos" : "t-num-neg"}`}>{formatBDT(expectedProfit)}</span></div>
                <div className="flex justify-between t-caption text-muted-ink"><span>Margin</span><span className={`t-num font-bold ${expectedMarginPct >= 0 ? "t-num-pos" : "t-num-neg"}`}>{expectedMarginPct.toFixed(1)}%</span></div>
              </div>
            </div>
          </SectionCard>

          {/* Section 6 — Milestones */}
          <SectionCard title="Milestones" icon={<Target />} accent="amber" bodyClassName="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Milestone Plan</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setMilestones([...milestones, { name: "", targetDate: null, status: "NOT_STARTED" }])}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Milestone</Button>
              </div>
              {milestones.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Input value={m.name ?? ""} onChange={(e) => updateMilestone(i, "name", e.target.value)} placeholder="Milestone name" className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  </div>
                  <div className="col-span-3">
                    <Input type="date" value={(m.targetDate ?? "").slice(0, 10)} onChange={(e) => updateMilestone(i, "targetDate", e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  </div>
                  <div className="col-span-3">
                    <Select value={m.status ?? "NOT_STARTED"} onValueChange={(v) => updateMilestone(i, "status", v ?? "NOT_STARTED")}>
                      <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(MILESTONE_STATUS_LABELS) as MilestoneStatus[]).map((s) => <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-debit" onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Section 7 — Linked Investment */}
          {investments.length > 0 && (
            <SectionCard title="Linked Investment" icon={<Link2 />} accent="blue" bodyClassName="p-4">
              <div className="flex items-center gap-2 rounded-xl border border-success bg-success-soft px-4 py-3">
                <Link2 className="h-5 w-5 text-success" />
                <div>
                  <p className="t-body font-semibold text-success">Funded by investment</p>
                  <p className="t-caption text-muted-ink">{investments[0].name} · {formatBDT(investments[0].amount)}</p>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Section 8 — Accounting Setup */}
          <SectionCard title="Accounting Setup" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Project Revenue Account</Label>
                <Select value={revenueAccountId} onValueChange={(v) => setRevenueAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Auto: Project Revenue" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.accountType === "INCOME").map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({a.accountCode})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project Expense Account</Label>
                <Select value={expenseAccountId} onValueChange={(v) => setExpenseAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Auto: Project Expenses" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.accountType === "EXPENSE").map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({a.accountCode})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>WIP Asset Account (optional)</Label>
                <Select value={wipAssetAccountId} onValueChange={(v) => setWipAssetAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="For WIP tracking" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.accountType === "ASSET").map((a) => <SelectItem key={a.id} value={a.id}>{a.accountName} ({a.accountCode})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default Bank / Cash Account</Label>
                <Select value={bankAccountId} onValueChange={(v) => setBankAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.accountName}{b.bankName ? ` — ${b.bankName}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-3 t-caption text-muted-ink">Leave blank to auto-resolve from the default Chart of Accounts (Project Revenue / Project Expenses).</p>
          </SectionCard>
        </div>

        {/* ═══ RIGHT (1 col) — Summary ═══ */}
        <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto">
          <SectionCard title="Summary" icon={<Briefcase />} accent="violet" bodyClassName="p-5 space-y-3">
            <Row label="Type" value={PROJECT_TYPE_LABELS[type]} />
            <Row label="Phase" value={PROJECT_PHASE_LABELS[phase]} />
            <Row label="Budget Source" value={BUDGET_SOURCE_LABELS[budgetSource]} />
            <div className="my-1 border-t border-[var(--border-base)]" />
            <Row label="Total Budget" value={formatBDT(budgetNum)} strong />
            <Row label="Cost Centers Allocated" value={formatBDT(ccTotal)} tone={Math.abs(ccTotal - budgetNum) < 0.01 ? "pos" : "warn"} />
            <Row label="Expected Revenue" value={formatBDT(revenueNum)} />
            <Row label="Expected Profit" value={formatBDT(expectedProfit)} tone={expectedProfit >= 0 ? "pos" : "neg"} />
            <Row label="Margin" value={`${expectedMarginPct.toFixed(1)}%`} tone={expectedMarginPct >= 0 ? "pos" : "neg"} />
          </SectionCard>
        </div>
      </div>

      {/* Floating action bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-base)] pt-4 lg:shrink-0">
        <Link href="/dashboard/projects"><Button variant="outline" type="button">Cancel</Button></Link>
        <Button type="button" className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handleSave}>
          {isPending ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="t-caption text-muted-ink">{label}</span>
      <span className={`t-num ${tone === "pos" ? "t-num-pos" : tone === "neg" ? "t-num-neg" : tone === "warn" ? "text-warning" : ""} ${strong ? "font-bold text-brand" : "font-semibold text-primary-ink"}`}>{value}</span>
    </div>
  )
}
