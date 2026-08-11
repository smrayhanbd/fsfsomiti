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
  Gem, FileText, History, LogOut, Trash2, Link2, ExternalLink, ScrollText, BadgeDollarSign,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import StatCard from "@/components/somiti/StatCard"
import { formatBDT, formatDate } from "@/lib/accounting"
import { InvestmentStatusBadge } from "@/components/portfolio/EntityBadges"
import {
  INCOME_TYPE_LABELS, EXIT_TYPE_LABELS, VALUATION_METHOD_LABELS,
  type InvestmentStatus, type InvestmentIncomeType, type InvestmentExitType, type ValuationMethod,
} from "@/lib/portfolio/types"
import { deleteInvestmentDraft, unlinkInvestmentProject } from "@/app/actions/investments"
import { LinkProjectToInvestment, CreateLinkedProjectButton } from "@/components/portfolio/LinkDialogs"
import InvestmentDistributeTab from "@/components/distribution/InvestmentDistributeTab"

interface DetailProps {
  investment: {
    id: string
    investmentNo: string
    name: string
    subCategory: string | null
    description: string | null
    investmentDate: string
    maturityDate: string | null
    tags: string[]
    investedAmount: number
    currency: string
    exchangeRate: number
    bdtEquivalent: number
    feesAmount: number
    costBasis: number
    currentValue: number
    gainLoss: number
    roi: number
    expectedAnnualReturn: number
    incomeTypes: string[]
    paymentFrequency: string | null
    status: InvestmentStatus
    paymentMethod: string | null
    referenceNo: string | null
    details: Record<string, unknown>
    documents: Array<{ name: string; type?: string; url: string; date?: string; notes?: string }>
    type: { id: string; name: string; slug: string }
    assetAccount: { id: string; accountName: string; accountCode: string }
  }
  incomes: Array<{
    id: string; incomeDate: string; incomeType: InvestmentIncomeType
    grossAmount: number; tdsAmount: number; netAmount: number
    referenceNo: string | null; voucherNo: string | null; notes: string | null
  }>
  exits: Array<{
    id: string; exitDate: string; exitType: InvestmentExitType
    proceeds: number; costBasisSold: number; capitalGainLoss: number
    netProceeds: number; taxAmount: number; notes: string | null
  }>
  valuations: Array<{
    id: string; valuationDate: string; marketValue: number
    method: ValuationMethod; valuer: string | null; changeAmount: number | null
  }>
  projects: Array<{
    linkId: string; relationshipType: string; relationshipNote: string | null
    id: string; name: string; projectNo: string; status: string
  }>
  allProjects: Array<{ id: string; projectNo: string; name: string }>
  vouchers: Array<{
    id: string; voucherNo: string; voucherType: string; entryDate: string
    narration: string; totalDebit: number; totalCredit: number
  }>
  purchaseVoucher: {
    voucherNo: string; voucherType: string
    lines: Array<{ accountName: string; debit: number; credit: number; memo: string | null }>
  } | null
  auditLogs: Array<{ id: string; action: string; summary: string; actorName: string | null; createdAt: string }>
  totalIncome: number
}

export default function InvestmentDetailClient(props: DetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { investment: inv } = props
  const isDraft = inv.status === "DRAFT"

  const handleDelete = () => {
    if (!confirm(`Delete draft investment "${inv.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deleteInvestmentDraft(inv.id)
      if (!res.ok) { toast.error("Could not delete", { description: res.error }); return }
      toast.success("Investment deleted")
      router.push("/dashboard/investments")
    })
  }

  const handleUnlink = (linkId: string) => {
    if (!confirm("Unlink this project from the investment?")) return
    startTransition(async () => {
      const res = await unlinkInvestmentProject(linkId)
      if (!res.ok) { toast.error("Could not unlink", { description: res.error }); return }
      toast.success("Project unlinked")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={inv.name}
        subtitle={`${inv.investmentNo} · ${inv.type.name}${inv.subCategory ? ` · ${inv.subCategory}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/investments"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>
            {isDraft && (
              <>
                <Link href={`/dashboard/investments/${inv.id}/edit`}>
                  <Button variant="outline"><Edit3 className="mr-2 h-4 w-4" /> Edit</Button>
                </Link>
                <Button variant="outline" className="text-debit" disabled={isPending} onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ═══ LEFT (2 cols): Tabs ═══ */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex h-auto flex-wrap gap-1 bg-transparent p-0">
              {[
                ["overview", "Overview"], ["income", `Income (${props.incomes.length})`],
                ["distribute", "Distribute"],
                ["valuation", `Valuations (${props.valuations.length})`], ["exits", `Exits (${props.exits.length})`],
                ["vouchers", `Vouchers (${props.vouchers.length})`], ["documents", `Documents (${inv.documents.length})`],
                ["activity", "Activity Log"],
              ].map(([v, label]) => (
                <TabsTrigger key={v} value={v} className="rounded-lg data-[state=active]:bg-subtle data-[state=active]:text-brand">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-0">
              <SectionCard title="Investment Details" icon={<Gem />} accent="blue" bodyClassName="p-5">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <Field label="Investment No" value={inv.investmentNo} />
                  <Field label="Type" value={inv.type.name} />
                  <Field label="Sub-category" value={inv.subCategory ?? "—"} />
                  <Field label="Status"><InvestmentStatusBadge status={inv.status} /></Field>
                  <Field label="Investment Date" value={formatDate(inv.investmentDate)} />
                  <Field label="Maturity Date" value={inv.maturityDate ? formatDate(inv.maturityDate) : "—"} />
                  <Field label="Currency" value={inv.currency} />
                  <Field label="Exchange Rate" value={inv.currency === "BDT" ? "—" : String(inv.exchangeRate)} />
                  <Field label="Asset Account" value={`${inv.assetAccount.accountName} (${inv.assetAccount.accountCode})`} />
                  <Field label="Payment Method" value={inv.paymentMethod ?? "—"} />
                  <Field label="Reference No" value={inv.referenceNo ?? "—"} />
                  <Field label="Expected Annual Return" value={`${inv.expectedAnnualReturn}%`} />
                </dl>
                {inv.description && <p className="mt-4 border-t border-[var(--border-base)] pt-3 t-body text-secondary-ink">{inv.description}</p>}
                {inv.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {inv.tags.map((t) => <span key={t} className="rounded-full bg-subtle px-2.5 py-1 t-caption text-secondary-ink">{t}</span>)}
                  </div>
                )}
                {Object.keys(inv.details).length > 0 && (
                  <div className="mt-4 border-t border-[var(--border-base)] pt-4">
                    <p className="t-overline mb-2 text-muted-ink">Type-Specific Details</p>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {Object.entries(inv.details).filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
                        <Field key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} value={String(v)} />
                      ))}
                    </dl>
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            {/* Income & Returns */}
            <TabsContent value="income" className="mt-0">
              <SectionCard title="Income & Returns" icon={<Coins />} accent="emerald"
                action={<Link href={`/dashboard/investments/${inv.id}/income/create`}><Button size="sm" className="brand-gradient"><Plus className="mr-1.5 h-4 w-4" /> Record Income</Button></Link>}
                bodyClassName="p-0">
                <Table>
                  <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                    <Th>Date</Th><Th>Type</Th><Th right>Net Amount</Th><Th right>Gross</Th><Th right>TDS</Th><Th>Reference</Th>
                  </TableRow></TableHeader>
                  <TableBody>
                    {props.incomes.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center t-body text-muted-ink">No income recorded yet.</td></tr>
                    ) : props.incomes.map((i) => (
                      <TableRow key={i.id} className="border-[var(--border-base)] hover:bg-subtle">
                        <Td>{formatDate(i.incomeDate)}</Td>
                        <Td>{INCOME_TYPE_LABELS[i.incomeType]}</Td>
                        <Td right strong>{formatBDT(i.netAmount)}</Td>
                        <Td right>{formatBDT(i.grossAmount)}</Td>
                        <Td right>{i.tdsAmount > 0 ? formatBDT(i.tdsAmount) : "—"}</Td>
                        <Td>{i.referenceNo ?? "—"}</Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>

            {/* Distribute income to members */}
            <TabsContent value="distribute" className="mt-0">
              <InvestmentDistributeTab
                investmentId={inv.id}
                investmentNo={inv.investmentNo}
                name={inv.name}
                investmentDate={inv.investmentDate}
                totalIncome={props.totalIncome}
              />
            </TabsContent>

            {/* Valuation History */}
            <TabsContent value="valuation" className="mt-0">
              <SectionCard title="Valuation History" icon={<TrendingUp />} accent="violet"
                action={<Link href={`/dashboard/investments/${inv.id}/valuation/create`}><Button size="sm" className="brand-gradient"><Plus className="mr-1.5 h-4 w-4" /> Update Valuation</Button></Link>}
                bodyClassName="p-0">
                <Table>
                  <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                    <Th>Date</Th><Th right>Market Value</Th><Th>Method</Th><Th>Valuer</Th><Th right>Change</Th>
                  </TableRow></TableHeader>
                  <TableBody>
                    {props.valuations.length === 0 ? (
                      <tr><td colSpan={5} className="py-12 text-center t-body text-muted-ink">No valuations recorded yet.</td></tr>
                    ) : props.valuations.map((v) => (
                      <TableRow key={v.id} className="border-[var(--border-base)] hover:bg-subtle">
                        <Td>{formatDate(v.valuationDate)}</Td>
                        <Td right strong>{formatBDT(v.marketValue)}</Td>
                        <Td>{VALUATION_METHOD_LABELS[v.method]}</Td>
                        <Td>{v.valuer ?? "—"}</Td>
                        <Td right><span className={v.changeAmount && v.changeAmount >= 0 ? "t-num-pos" : "t-num-neg"}>{v.changeAmount != null ? `${v.changeAmount >= 0 ? "+" : ""}${formatBDT(v.changeAmount)}` : "—"}</span></Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>

            {/* Exit / Disposal */}
            <TabsContent value="exits" className="mt-0">
              <SectionCard title="Exit / Disposal Record" icon={<LogOut />} accent="crimson"
                action={<Link href={`/dashboard/investments/${inv.id}/exit/create`}><Button size="sm" className="brand-gradient"><Plus className="mr-1.5 h-4 w-4" /> Record Exit</Button></Link>}
                bodyClassName="p-0">
                <Table>
                  <TableHeader><TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                    <Th>Date</Th><Th>Type</Th><Th right>Proceeds</Th><Th right>Cost Basis</Th><Th right>Gain/Loss</Th><Th right>Net</Th>
                  </TableRow></TableHeader>
                  <TableBody>
                    {props.exits.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center t-body text-muted-ink">No exits recorded yet.</td></tr>
                    ) : props.exits.map((e) => (
                      <TableRow key={e.id} className="border-[var(--border-base)] hover:bg-subtle">
                        <Td>{formatDate(e.exitDate)}</Td>
                        <Td>{EXIT_TYPE_LABELS[e.exitType]}</Td>
                        <Td right>{formatBDT(e.proceeds)}</Td>
                        <Td right>{formatBDT(e.costBasisSold)}</Td>
                        <Td right><span className={e.capitalGainLoss >= 0 ? "t-num-pos" : "t-num-neg"}>{formatBDT(e.capitalGainLoss)}</span></Td>
                        <Td right strong>{formatBDT(e.netProceeds)}</Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>

            {/* Journal Vouchers */}
            <TabsContent value="vouchers" className="mt-0">
              <SectionCard title="Journal Vouchers" icon={<ScrollText />} accent="blue" bodyClassName="p-0">
                {props.purchaseVoucher && (
                  <div className="border-b border-[var(--border-base)] p-5">
                    <p className="t-overline mb-2 text-muted-ink">Purchase Entry — {props.purchaseVoucher.voucherNo}</p>
                    <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-subtle/60">
                          <th className="t-overline px-3 py-2 text-left text-muted-ink">Account</th>
                          <th className="t-overline px-3 py-2 text-right text-muted-ink">Dr</th>
                          <th className="t-overline px-3 py-2 text-right text-muted-ink">Cr</th>
                        </tr></thead>
                        <tbody>
                          {props.purchaseVoucher.lines.map((l, i) => (
                            <tr key={i} className="border-t border-[var(--border-base)]">
                              <td className="t-caption px-3 py-2 text-secondary-ink">{l.accountName}</td>
                              <td className="t-num px-3 py-2 text-right">{l.debit > 0 ? formatBDT(l.debit) : "—"}</td>
                              <td className="t-num px-3 py-2 text-right">{l.credit > 0 ? formatBDT(l.credit) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
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
                {inv.documents.length === 0 ? (
                  <p className="t-body text-muted-ink">No documents attached.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {inv.documents.map((d, i) => (
                      <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 transition-colors hover:bg-[var(--bg-elevated)]">
                        <FileText className="h-5 w-5 text-muted-ink" />
                        <div className="min-w-0 flex-1">
                          <p className="t-body truncate font-semibold text-primary-ink">{d.name}</p>
                          {d.date && <p className="t-caption text-muted-ink">{formatDate(d.date)}</p>}
                        </div>
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
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient-soft">
                        <History className="h-3.5 w-3.5 text-brand" />
                      </div>
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
        </div>

        {/* ═══ RIGHT (1 col): Summary + Quick Actions ═══ */}
        <div className="space-y-4">
          <SectionCard title="Summary" icon={<Gem />} accent="violet" bodyClassName="p-5">
            <div className="mb-3 flex items-center gap-2">
              <InvestmentStatusBadge status={inv.status} />
            </div>
            <div className="space-y-2">
              <Row label="Invested" value={formatBDT(inv.costBasis)} />
              <Row label="Current Value" value={formatBDT(inv.currentValue)} strong />
              <Row label="Gain / Loss" value={formatBDT(inv.gainLoss)} tone={inv.gainLoss >= 0 ? "pos" : "neg"} />
              <Row label="ROI" value={`${inv.roi >= 0 ? "+" : ""}${inv.roi.toFixed(1)}%`} tone={inv.roi >= 0 ? "pos" : "neg"} />
              <div className="my-1 border-t border-[var(--border-base)]" />
              <Row label="Total Income" value={formatBDT(props.totalIncome)} />
            </div>
          </SectionCard>

          <SectionCard title="Quick Actions" icon={<BadgeDollarSign />} accent="gold" bodyClassName="p-3 space-y-2">
            <QuickAction href={`/dashboard/investments/${inv.id}/income/create`} icon={Coins} label="Record Income" />
            <QuickAction href={`/dashboard/investments/${inv.id}/valuation/create`} icon={TrendingUp} label="Update Valuation" />
            <QuickAction href={`/dashboard/investments/${inv.id}/exit/create`} icon={LogOut} label="Record Exit / Disposal" />
          </SectionCard>

          <SectionCard
            title="Linked Projects"
            icon={<Link2 />}
            accent="blue"
            bodyClassName="p-3 space-y-2"
            action={
              <div className="flex flex-wrap gap-1.5">
                <LinkProjectToInvestment investmentId={inv.id} options={props.allProjects} linkedIds={props.projects.map((p) => p.id)} />
                <CreateLinkedProjectButton investmentId={inv.id} />
              </div>
            }
          >
            {props.projects.length === 0 ? (
              <p className="t-caption text-muted-ink">No projects linked yet. Link an existing project or create a new one from this investment.</p>
            ) : (
              props.projects.map((p) => (
                <div key={p.linkId} className="flex items-center justify-between rounded-lg border border-[var(--border-base)] bg-subtle px-3 py-2 transition-colors hover:bg-[var(--bg-elevated)]">
                  <Link href={`/dashboard/projects/${p.id}`} className="min-w-0 flex-1">
                    <p className="t-body truncate font-semibold text-primary-ink hover:text-brand">{p.name}</p>
                    <p className="t-num t-caption text-muted-ink">{p.projectNo} · {p.relationshipType === "FUNDS_PROJECT" ? "Funds Project" : "Manages Asset"}</p>
                  </Link>
                  <div className="flex items-center gap-1">
                    <Link href={`/dashboard/projects/${p.id}`}><ExternalLink className="h-4 w-4 text-brand" /></Link>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-debit" disabled={isPending} onClick={() => handleUnlink(p.linkId)} title="Unlink">
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ──
function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="t-overline text-muted-ink">{label}</dt>
      <dd className="t-body mt-0.5 text-primary-ink">{children ?? value}</dd>
    </div>
  )
}
function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="t-caption text-muted-ink">{label}</span>
      <span className={`t-num ${tone === "pos" ? "t-num-pos" : tone === "neg" ? "t-num-neg" : ""} ${strong ? "font-bold text-brand" : "font-semibold text-primary-ink"}`}>{value}</span>
    </div>
  )
}
function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Coins; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 t-body font-medium text-secondary-ink transition-colors hover:bg-subtle hover:text-brand">
      <Icon className="h-4 w-4" /> {label}
    </Link>
  )
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <TableHead className={`t-overline ${right ? "text-right" : "text-left"} text-muted-ink`}>{children}</TableHead>
}
function Td({ children, right, strong }: { children: React.ReactNode; right?: boolean; strong?: boolean }) {
  return <TableCell className={`t-body ${right ? "t-num text-right" : "text-secondary-ink"} ${strong ? "font-semibold text-primary-ink" : ""}`}>{children}</TableCell>
}
