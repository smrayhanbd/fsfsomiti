"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  ArrowLeft, Edit3, Plus, TrendingUp, TrendingDown, Coins, BookOpen,
  Briefcase, FileText, History, LogOut, Trash2, Link2, ExternalLink, ScrollText, Target, ListChecks, Scale, PieChart,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT, formatDate } from "@/lib/accounting"
import { ProjectStatusBadge } from "@/components/portfolio/EntityBadges"
import {
  PROJECT_TYPE_LABELS, PROJECT_PHASE_LABELS, BUDGET_SOURCE_LABELS,
  EXPENSE_CATEGORY_LABELS, REVENUE_TYPE_LABELS, MILESTONE_STATUS_LABELS,
  type ProjectType, type ProjectStatus, type ProjectPhase, type BudgetSource,
  type ProjectExpenseCategory, type ProjectRevenueType, type MilestoneStatus,
} from "@/lib/portfolio/types"
import { deleteProjectDraft, unlinkProjectInvestment } from "@/app/actions/projects"
import { LinkInvestmentToProject } from "@/components/portfolio/LinkDialogs"

interface DetailProps {
  project: {
    id: string; projectNo: string; name: string; type: ProjectType; code: string | null
    description: string | null; tags: string[]; phase: ProjectPhase; status: ProjectStatus
    plannedStartDate: string | null; plannedEndDate: string | null; actualStartDate: string | null
    manager: { id: string; fullName: string; memberNo: string } | null
    sponsor: { id: string; fullName: string; memberNo: string } | null
    totalBudget: number; budgetSource: BudgetSource
    revenuePlan: { expectedRevenue?: number }
    documents: Array<{ name: string; type?: string; url: string; date?: string }>
  }
  totalSpent: number
  totalRevenue: number
  netPL: number
  costCenters: Array<{ name: string; budget: number; spend: number; remaining: number; usedPct: number }>
  expenses: Array<{
    id: string; expenseDate: string; referenceNo: string | null; description: string
    costCenterName: string | null; category: ProjectExpenseCategory; amount: number
    paymentMethod: string | null; voucherNo: string | null
  }>
  revenues: Array<{
    id: string; revenueDate: string; referenceNo: string | null; description: string
    revenueType: ProjectRevenueType; amount: number; customer: string | null; voucherNo: string | null
  }>
  milestones: Array<{ id: string; name: string; targetDate: string | null; actualDate: string | null; status: MilestoneStatus; notes: string | null }>
  tasks: Array<{ id: string; title: string; status: string; dueDate: string | null }>
  investments: Array<{ linkId: string; relationshipType: string; id: string; name: string; investmentNo: string; status: string }>
  allInvestments: Array<{ id: string; investmentNo: string; name: string }>
  vouchers: Array<{ id: string; voucherNo: string; voucherType: string; entryDate: string; narration: string; totalDebit: number; totalCredit: number }>
  auditLogs: Array<{ id: string; action: string; summary: string; actorName: string | null; createdAt: string }>
}

export default function ProjectDetailClient(props: DetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { project: p } = props
  const budgetUsedPct = p.totalBudget > 0 ? (props.totalSpent / p.totalBudget) * 100 : 0
  const remaining = p.totalBudget - props.totalSpent
  const canDelete = props.expenses.length === 0 && props.revenues.length === 0

  const handleDelete = () => {
    if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deleteProjectDraft(p.id)
      if (!res.ok) { toast.error("Could not delete", { description: res.error }); return }
      toast.success("Project deleted")
      router.push("/dashboard/projects")
    })
  }

  const handleUnlink = (linkId: string) => {
    if (!confirm("Unlink this investment from the project?")) return
    startTransition(async () => {
      const res = await unlinkProjectInvestment(linkId)
      if (!res.ok) { toast.error("Could not unlink", { description: res.error }); return }
      toast.success("Investment unlinked")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.name}
        subtitle={`${p.projectNo} · ${PROJECT_TYPE_LABELS[p.type]}${p.code ? ` · ${p.code}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/projects"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
            <Link href={`/dashboard/projects/${p.id}/edit`}><Button variant="outline"><Edit3 className="mr-2 h-4 w-4" /> Edit</Button></Link>
            {canDelete && (
              <Button variant="outline" className="text-debit" disabled={isPending} onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            )}
          </div>
        }
      />

      {/* Header summary bar */}
      <SectionCard icon={<Briefcase />} accent="violet" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2"><ProjectStatusBadge status={p.status} /><span className="rounded-full bg-subtle px-2.5 py-1 t-caption text-secondary-ink">{PROJECT_PHASE_LABELS[p.phase]}</span></div>
          <div className="t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">Manager:</span> {p.manager?.fullName ?? "—"}</div>
          <div className="t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">Start:</span> {p.plannedStartDate ? formatDate(p.plannedStartDate) : "—"}</div>
          <div className="t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">End:</span> {p.plannedEndDate ? formatDate(p.plannedEndDate) : "—"}</div>
          <div className="t-num t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">Budget:</span> {formatBDT(p.totalBudget)}</div>
          <div className="t-num t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">Spent:</span> {formatBDT(props.totalSpent)}</div>
          <div className={`t-num t-caption ${remaining >= 0 ? "text-success" : "text-debit"}`}><span className="font-semibold">Remaining:</span> {formatBDT(remaining)}</div>
          <div className="t-num t-caption text-muted-ink"><span className="font-semibold text-secondary-ink">Revenue:</span> {formatBDT(props.totalRevenue)}</div>
          <div className={`t-num t-caption font-bold ${props.netPL >= 0 ? "t-num-pos" : "t-num-neg"}`}><span>P&amp;L:</span> {formatBDT(props.netPL)}</div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
            <div className={`h-full rounded-full ${budgetUsedPct > 100 ? "bg-[var(--status-debit)]" : budgetUsedPct > 80 ? "bg-[var(--status-warning)]" : "bg-[var(--status-success)]"}`} style={{ width: `${Math.min(budgetUsedPct, 100)}%` }} />
          </div>
          <span className="t-num t-caption font-semibold text-muted-ink">{budgetUsedPct.toFixed(0)}% used</span>
        </div>
      </SectionCard>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1 bg-transparent p-0">
          {[
            ["overview", "Overview"],
            ["budget", "Budget"],
            ["expenses", `Expenses (${props.expenses.length})`],
            ["revenue", `Revenue (${props.revenues.length})`],
            ["pl", "Profit & Loss"],
            ["milestones", `Milestones (${props.milestones.length})`],
            ["tasks", `Tasks (${props.tasks.length})`],
            ["vouchers", `Vouchers (${props.vouchers.length})`],
            ["documents", `Documents (${p.documents.length})`],
            ["activity", "Activity Log"],
          ].map(([v, label]) => (
            <TabsTrigger key={v} value={v} className="rounded-lg data-[state=active]:bg-subtle data-[state=active]:text-brand">{label}</TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-0">
          <SectionCard title="Project Details" icon={<Briefcase />} accent="blue" bodyClassName="p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Project No" value={p.projectNo} />
              <Field label="Type" value={PROJECT_TYPE_LABELS[p.type]} />
              <Field label="Status"><ProjectStatusBadge status={p.status} /></Field>
              <Field label="Phase" value={PROJECT_PHASE_LABELS[p.phase]} />
              <Field label="Manager" value={p.manager?.fullName ?? "—"} />
              <Field label="Sponsor" value={p.sponsor?.fullName ?? "—"} />
              <Field label="Planned Start" value={p.plannedStartDate ? formatDate(p.plannedStartDate) : "—"} />
              <Field label="Planned End" value={p.plannedEndDate ? formatDate(p.plannedEndDate) : "—"} />
              <Field label="Total Budget" value={formatBDT(p.totalBudget)} />
              <Field label="Budget Source" value={BUDGET_SOURCE_LABELS[p.budgetSource]} />
              <Field label="Expected Revenue" value={p.revenuePlan?.expectedRevenue ? formatBDT(Number(p.revenuePlan.expectedRevenue)) : "—"} />
            </dl>
            {p.description && <p className="mt-4 border-t border-[var(--border-base)] pt-3 t-body text-secondary-ink">{p.description}</p>}
            {p.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="rounded-full bg-subtle px-2.5 py-1 t-caption text-secondary-ink">{t}</span>)}</div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Budget & Cost Centers */}
        <TabsContent value="budget" className="mt-0">
          <SectionCard title="Budget & Cost Centers" icon={<Scale />} accent="emerald" bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Cost Center</Th><Th right>Budget</Th><Th right>Spent</Th><Th right>Remaining</Th><Th>Used</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.costCenters.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center t-body text-muted-ink">No cost centers defined.</td></tr>
                ) : props.costCenters.map((cc, i) => (
                  <TableRow key={i} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td strong>{cc.name}</Td>
                    <Td right>{formatBDT(cc.budget)}</Td>
                    <Td right>{formatBDT(cc.spend)}</Td>
                    <Td right><span className={cc.remaining >= 0 ? "t-num-pos" : "t-num-neg"}>{formatBDT(cc.remaining)}</span></Td>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                          <div className={`h-full rounded-full ${cc.usedPct > 100 ? "bg-[var(--status-debit)]" : cc.usedPct > 80 ? "bg-[var(--status-warning)]" : "bg-[var(--status-success)]"}`} style={{ width: `${Math.min(cc.usedPct, 100)}%` }} />
                        </div>
                        <span className="t-num t-caption text-muted-ink">{cc.usedPct.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        {/* Expenses */}
        <TabsContent value="expenses" className="mt-0">
          <SectionCard title="Expenses" icon={<TrendingDown />} accent="crimson"
            action={<Link href={`/dashboard/projects/${p.id}/expenses/create`}><Button size="sm" className="brand-gradient"><Plus className="mr-1.5 h-4 w-4" /> Add Expense</Button></Link>}
            bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Date</Th><Th>Description</Th><Th>Cost Center</Th><Th>Category</Th><Th right>Amount</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.expenses.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center t-body text-muted-ink">No expenses recorded yet.</td></tr>
                ) : props.expenses.map((e) => (
                  <TableRow key={e.id} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td>{formatDate(e.expenseDate)}</Td>
                    <Td>{e.description}{e.referenceNo && <span className="t-caption text-muted-ink"> · {e.referenceNo}</span>}</Td>
                    <Td><span className="rounded-full bg-subtle px-2 py-0.5 t-caption">{e.costCenterName ?? "—"}</span></Td>
                    <Td>{EXPENSE_CATEGORY_LABELS[e.category]}</Td>
                    <Td right strong>{formatBDT(e.amount)}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {props.expenses.length > 0 && (
              <div className="flex justify-end border-t border-[var(--border-base)] px-4 py-3">
                <span className="t-caption text-muted-ink">Total: <span className="t-num font-bold text-primary-ink">{formatBDT(props.totalSpent)}</span></span>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Revenue */}
        <TabsContent value="revenue" className="mt-0">
          <SectionCard title="Revenue" icon={<TrendingUp />} accent="emerald"
            action={<Link href={`/dashboard/projects/${p.id}/revenue/create`}><Button size="sm" className="brand-gradient"><Plus className="mr-1.5 h-4 w-4" /> Add Revenue</Button></Link>}
            bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Date</Th><Th>Description</Th><Th>Type</Th><Th>Customer</Th><Th right>Amount</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.revenues.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center t-body text-muted-ink">No revenue recorded yet.</td></tr>
                ) : props.revenues.map((r) => (
                  <TableRow key={r.id} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td>{formatDate(r.revenueDate)}</Td>
                    <Td>{r.description}</Td>
                    <Td>{REVENUE_TYPE_LABELS[r.revenueType]}</Td>
                    <Td>{r.customer ?? "—"}</Td>
                    <Td right strong>{formatBDT(r.amount)}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {props.revenues.length > 0 && (
              <div className="flex justify-end border-t border-[var(--border-base)] px-4 py-3">
                <span className="t-caption text-muted-ink">Total: <span className="t-num font-bold text-primary-ink">{formatBDT(props.totalRevenue)}</span></span>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Profit & Loss */}
        <TabsContent value="pl" className="mt-0">
          <SectionCard title="Project Profit & Loss" icon={<Scale />} accent="gold" bodyClassName="p-5">
            <div className="font-mono text-sm">
              <p className="mb-3 t-h3 font-sans text-primary-ink">PROJECT PROFIT &amp; LOSS</p>
              <p className="t-overline text-muted-ink">REVENUE</p>
              {props.revenues.length === 0 ? (
                <p className="py-1 text-muted-ink">No revenue</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(groupBy(props.revenues, (r) => r.revenueType)).map(([type, items]) => (
                    <div key={type} className="flex justify-between">
                      <span className="text-secondary-ink">{REVENUE_TYPE_LABELS[type as ProjectRevenueType]}</span>
                      <span className="t-num text-primary-ink">{formatBDT(items.reduce((s, r) => s + r.amount, 0))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="my-2 border-t border-[var(--border-base)]" />
              <div className="flex justify-between font-bold">
                <span className="text-primary-ink">Total Revenue</span><span className="t-num text-primary-ink">{formatBDT(props.totalRevenue)}</span>
              </div>

              <p className="mt-4 t-overline text-muted-ink">EXPENSES (by Cost Center)</p>
              {props.costCenters.filter((c) => c.spend > 0).length === 0 ? (
                <p className="py-1 text-muted-ink">No expenses</p>
              ) : (
                <div className="space-y-1">
                  {props.costCenters.filter((c) => c.spend > 0).map((cc, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-secondary-ink">{cc.name}</span>
                      <span className="t-num text-primary-ink">{formatBDT(cc.spend)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="my-2 border-t border-[var(--border-base)]" />
              <div className="flex justify-between font-bold">
                <span className="text-primary-ink">Total Expenses</span><span className="t-num text-primary-ink">{formatBDT(props.totalSpent)}</span>
              </div>

              <div className="mt-4 border-t-2 border-[var(--border-strong)] pt-3">
                <div className="flex justify-between text-base font-bold">
                  <span className="text-primary-ink">NET PROFIT / (LOSS)</span>
                  <span className={`t-num ${props.netPL >= 0 ? "t-num-pos" : "t-num-neg"}`}>{formatBDT(props.netPL)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-ink">PROFIT MARGIN</span>
                  <span className={`t-num font-semibold ${props.netPL >= 0 ? "t-num-pos" : "t-num-neg"}`}>
                    {props.totalRevenue > 0 ? `${((props.netPL / props.totalRevenue) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="mt-0">
          <SectionCard title="Milestones" icon={<Target />} accent="amber" bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Milestone</Th><Th>Target Date</Th><Th>Actual Date</Th><Th>Status</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.milestones.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center t-body text-muted-ink">No milestones defined.</td></tr>
                ) : props.milestones.map((m) => (
                  <TableRow key={m.id} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td strong>{m.name}</Td>
                    <Td>{m.targetDate ? formatDate(m.targetDate) : "—"}</Td>
                    <Td>{m.actualDate ? formatDate(m.actualDate) : "—"}</Td>
                    <Td><span className={`rounded-full px-2.5 py-1 t-caption font-medium ${m.status === "COMPLETED" ? "bg-success-soft text-success" : m.status === "DELAYED" ? "bg-debit-soft text-debit" : m.status === "IN_PROGRESS" ? "bg-info-soft text-info" : "bg-subtle text-secondary-ink"}`}>{MILESTONE_STATUS_LABELS[m.status]}</span></Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks" className="mt-0">
          <SectionCard title="Tasks" icon={<ListChecks />} accent="blue"
            action={<Link href={`/dashboard/tasks?project=${p.id}`}><Button size="sm" variant="outline"><ExternalLink className="mr-1.5 h-4 w-4" /> Open Task Module</Button></Link>}
            bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Task</Th><Th>Status</Th><Th>Due Date</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.tasks.length === 0 ? (
                  <tr><td colSpan={3} className="py-12 text-center t-body text-muted-ink">No tasks linked to this project yet.</td></tr>
                ) : props.tasks.map((t) => (
                  <TableRow key={t.id} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td><Link href={`/dashboard/tasks/${t.id}`} className="font-semibold text-primary-ink hover:text-brand">{t.title}</Link></Td>
                    <Td><span className="rounded-full bg-subtle px-2 py-0.5 t-caption">{t.status}</span></Td>
                    <Td>{t.dueDate ? formatDate(t.dueDate) : "—"}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        {/* Vouchers */}
        <TabsContent value="vouchers" className="mt-0">
          <SectionCard title="Journal Vouchers" icon={<ScrollText />} accent="blue" bodyClassName="p-0">
            <Table>
              <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <Th>Voucher No</Th><Th>Date</Th><Th>Type</Th><Th>Narration</Th><Th right>Dr</Th><Th right>Cr</Th>
              </TableRow></TableHeader>
              <TableBody>
                {props.vouchers.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center t-body text-muted-ink">No vouchers linked.</td></tr>
                ) : props.vouchers.map((v) => (
                  <TableRow key={v.id} className="border-[var(--border-base)] hover:bg-subtle">
                    <Td strong>{v.voucherNo}</Td>
                    <Td>{formatDate(v.entryDate)}</Td>
                    <Td><span className="rounded-full bg-subtle px-2 py-0.5 t-caption">{v.voucherType}</span></Td>
                    <Td><span className="t-caption text-muted-ink">{v.narration}</span></Td>
                    <Td right>{formatBDT(v.totalDebit)}</Td>
                    <Td right>{formatBDT(v.totalCredit)}</Td>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="mt-0">
          <SectionCard title="Documents" icon={<FileText />} accent="amber" bodyClassName="p-5">
            {p.documents.length === 0 ? (
              <p className="t-body text-muted-ink">No documents attached.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {p.documents.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 transition-colors hover:bg-[var(--bg-elevated)]">
                    <FileText className="h-5 w-5 text-muted-ink" />
                    <div className="min-w-0 flex-1"><p className="t-body truncate font-semibold text-primary-ink">{d.name}</p>{d.date && <p className="t-caption text-muted-ink">{formatDate(d.date)}</p>}</div>
                    <ExternalLink className="h-4 w-4 text-brand" />
                  </a>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* Activity Log */}
        <TabsContent value="activity" className="mt-0">
          <SectionCard title="Activity Log" icon={<History />} accent="violet" bodyClassName="p-0">
            <div className="divide-y divide-[var(--border-base)]">
              {props.auditLogs.length === 0 ? (
                <p className="py-12 text-center t-body text-muted-ink">No activity yet.</p>
              ) : props.auditLogs.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient-soft"><History className="h-3.5 w-3.5 text-brand" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="t-body text-primary-ink"><span className="font-semibold">{a.action}</span> · {a.summary}</p>
                    <p className="t-caption text-muted-ink">{a.actorName ?? "System"} · {formatDate(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Linked investments */}
      <SectionCard
        icon={<Link2 />}
        title="Linked Investments"
        accent="blue"
        action={<LinkInvestmentToProject projectId={p.id} options={props.allInvestments} linkedIds={props.investments.map((i) => i.id)} />}
        bodyClassName="p-0"
      >
        <Table>
          <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
            <Th>Investment No</Th><Th>Name</Th><Th>Relationship</Th><Th>Status</Th><Th right>Action</Th>
          </TableRow></TableHeader>
          <TableBody>
            {props.investments.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center t-body text-muted-ink">No investments linked to this project yet.</td></tr>
            ) : props.investments.map((inv) => (
              <TableRow key={inv.linkId} className="border-[var(--border-base)] hover:bg-subtle">
                <Td><Link href={`/dashboard/investments/${inv.id}`} className="t-num font-semibold text-primary-ink hover:text-brand">{inv.investmentNo}</Link></Td>
                <Td>{inv.name}</Td>
                <Td><span className="rounded-full bg-subtle px-2 py-0.5 t-caption">{inv.relationshipType === "FUNDS_PROJECT" ? "Funds Project" : "Manages Asset"}</span></Td>
                <Td><span className="t-caption text-muted-ink">{inv.status}</span></Td>
                <Td right>
                  <Button variant="ghost" size="sm" className="text-debit" disabled={isPending} onClick={() => handleUnlink(inv.linkId)}>Unlink</Button>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/projects/${p.id}/expenses/create`}><Button variant="outline"><TrendingDown className="mr-2 h-4 w-4" /> Record Expense</Button></Link>
        <Link href={`/dashboard/projects/${p.id}/revenue/create`}><Button variant="outline"><Coins className="mr-2 h-4 w-4" /> Record Revenue</Button></Link>
        <Link href={`/dashboard/distributions/new?projectId=${p.id}`}><Button variant="outline"><PieChart className="mr-2 h-4 w-4" /> Distribute Profit</Button></Link>
        <Link href={`/dashboard/tasks?project=${p.id}`}><Button variant="outline"><ListChecks className="mr-2 h-4 w-4" /> Add Task</Button></Link>
      </div>
    </div>
  )
}

// ── Helpers ──
function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ??= []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}
function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><dt className="t-overline text-muted-ink">{label}</dt><dd className="t-body mt-0.5 text-primary-ink">{children ?? value}</dd></div>)
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <TableHead className={`t-overline ${right ? "text-right" : "text-left"} text-muted-ink`}>{children}</TableHead>
}
function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return <TableCell className={`t-body ${right ? "t-num text-right" : "text-secondary-ink"} ${strong ? "font-semibold text-primary-ink" : ""}`}>{children}</TableCell>
}
