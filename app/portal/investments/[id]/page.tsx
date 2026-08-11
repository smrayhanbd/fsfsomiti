import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatBDT, formatDate } from "@/lib/accounting"
import { getTransparencySettings } from "@/app/actions/portal"
import { InvestmentStatusBadge } from "@/components/portfolio/EntityBadges"
import SectionCard from "@/components/somiti/SectionCard"
import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Gem, Wallet, TrendingUp, TrendingDown, ArrowLeft, CalendarDays, FileText } from "lucide-react"

export const dynamic = "force-dynamic"

/**
 * Member portal → Investment detail (read-only).
 *
 * Shows the public financial sections of a single investment. Internal CoA
 * account IDs, voucher linkage, and audit actor info are deliberately excluded.
 */
export default async function PortalInvestmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showInvestments) redirect("/portal")

  const { id } = await params

  const investment = await prisma.investment.findFirst({
    where: { id, isDeleted: false },
    include: {
      investmentType: { select: { id: true, name: true, slug: true } },
      incomes: { orderBy: { incomeDate: "desc" }, take: 50 },
      exits: { orderBy: { exitDate: "desc" }, take: 50 },
      valuations: { orderBy: { valuationDate: "desc" }, take: 50 },
      projectLinks: { select: { project: { select: { id: true, name: true, projectNo: true, status: true } } } },
    },
  })
  if (!investment) notFound()

  const invested = Number(investment.costBasis)
  const current = Number(investment.currentValue || investment.costBasis)
  const gainLoss = current - invested
  const roi = invested > 0 ? (gainLoss / invested) * 100 : 0
  const totalIncome = investment.incomes.reduce((s, i) => s + Number(i.netAmount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/portal/investments" className="inline-flex w-fit items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Investments
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{investment.name}</h1>
              <InvestmentStatusBadge status={investment.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-mono">{investment.investmentNo}</span> · {investment.investmentType.name}
              {investment.subCategory ? ` · ${investment.subCategory}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Cost Basis" value={<Money amount={invested} />} icon={Wallet} accent="blue" />
        <StatCard label="Current Value" value={<Money amount={current} />} icon={Gem} accent="violet" />
        <StatCard
          label="Unrealized Gain/Loss"
          value={<Money amount={gainLoss} />}
          icon={gainLoss >= 0 ? TrendingUp : TrendingDown}
          accent={gainLoss >= 0 ? "emerald" : "crimson"}
          hint={`${roi >= 0 ? "+" : ""}${roi.toFixed(2)}% ROI`}
        />
        <StatCard label="Income Received" value={<Money amount={totalIncome} />} icon={TrendingUp} accent="gold" />
      </div>

      {/* Overview */}
      <SectionCard title="Overview" icon={<Gem />} accent="blue">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <Detail label="Investment Date">{formatDate(investment.investmentDate)}</Detail>
          <Detail label="Maturity Date">{investment.maturityDate ? formatDate(investment.maturityDate) : "—"}</Detail>
          <Detail label="Expected Annual Return">{Number(investment.expectedAnnualReturn) ? `${Number(investment.expectedAnnualReturn)}%` : "—"}</Detail>
          <Detail label="Invested Amount"><Money amount={Number(investment.investedAmount)} /></Detail>
          <Detail label="Fees"><Money amount={Number(investment.feesAmount)} /></Detail>
          <Detail label="Currency">{investment.currency}</Detail>
        </dl>
        {investment.description && (
          <div className="mt-4 rounded-lg bg-inset p-3 text-sm text-secondary-ink">
            <p>{investment.description}</p>
          </div>
        )}
      </SectionCard>

      {/* Valuation history */}
      <SectionCard title="Valuation History" icon={<TrendingUp />}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="t-overline text-muted-ink">Date</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Market Value</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Change</TableHead>
                <TableHead className="t-overline text-muted-ink">Method</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investment.valuations.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={4} className="py-8 text-center t-body text-muted-ink">No valuations recorded.</TableCell>
                </TableRow>
              ) : (
                investment.valuations.map((v) => {
                  const change = v.changeAmount !== null ? Number(v.changeAmount) : null
                  return (
                    <TableRow key={v.id} className="border-[var(--border-base)] last:border-0 hover:bg-subtle">
                      <TableCell className="py-3 text-secondary-ink">{formatDate(v.valuationDate)}</TableCell>
                      <TableCell className="py-3 text-right t-num font-medium text-primary-ink">{formatBDT(Number(v.marketValue))}</TableCell>
                      <TableCell className={`py-3 text-right t-num ${change === null ? "text-muted-ink" : change >= 0 ? "text-success" : "text-debit"}`}>
                        {change === null ? "—" : `${change >= 0 ? "+" : "−"}${formatBDT(Math.abs(change))}`}
                      </TableCell>
                      <TableCell className="py-3 t-caption text-muted-ink">{v.method.replace(/_/g, " ")}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Income & Exits — two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Income Received" icon={<TrendingUp />} accent="emerald" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                  <TableHead className="t-overline px-4 text-muted-ink">Date</TableHead>
                  <TableHead className="t-overline px-4 text-muted-ink">Type</TableHead>
                  <TableHead className="t-overline px-4 text-right text-muted-ink">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investment.incomes.length === 0 ? (
                  <TableRow className="border-[var(--border-base)]">
                    <TableCell colSpan={3} className="py-8 text-center t-body text-muted-ink">No income recorded.</TableCell>
                  </TableRow>
                ) : (
                  investment.incomes.map((i) => (
                    <TableRow key={i.id} className="border-[var(--border-base)] last:border-0 hover:bg-subtle">
                      <TableCell className="px-4 py-3 text-secondary-ink">{formatDate(i.incomeDate)}</TableCell>
                      <TableCell className="px-4 py-3 t-caption text-muted-ink">{i.incomeType.replace(/_/g, " ")}</TableCell>
                      <TableCell className="px-4 py-3 text-right t-num text-success">+{formatBDT(Number(i.netAmount))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Exits / Realizations" icon={<TrendingDown />} accent="crimson" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                  <TableHead className="t-overline px-4 text-muted-ink">Date</TableHead>
                  <TableHead className="t-overline px-4 text-muted-ink">Type</TableHead>
                  <TableHead className="t-overline px-4 text-right text-muted-ink">Net Proceeds</TableHead>
                  <TableHead className="t-overline px-4 text-right text-muted-ink">Gain/Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investment.exits.length === 0 ? (
                  <TableRow className="border-[var(--border-base)]">
                    <TableCell colSpan={4} className="py-8 text-center t-body text-muted-ink">No exits recorded.</TableCell>
                  </TableRow>
                ) : (
                  investment.exits.map((e) => (
                    <TableRow key={e.id} className="border-[var(--border-base)] last:border-0 hover:bg-subtle">
                      <TableCell className="px-4 py-3 text-secondary-ink">{formatDate(e.exitDate)}</TableCell>
                      <TableCell className="px-4 py-3 t-caption text-muted-ink">{e.exitType.replace(/_/g, " ")}</TableCell>
                      <TableCell className="px-4 py-3 text-right t-num text-primary-ink">{formatBDT(Number(e.netProceeds))}</TableCell>
                      <TableCell className={`px-4 py-3 text-right t-num font-medium ${Number(e.capitalGainLoss) >= 0 ? "text-success" : "text-debit"}`}>
                        {Number(e.capitalGainLoss) >= 0 ? "+" : "−"}{formatBDT(Math.abs(Number(e.capitalGainLoss)))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>

      {/* Linked projects */}
      {investment.projectLinks.length > 0 && (
        <SectionCard title="Linked Projects" icon={<FileText />} accent="violet">
          <div className="flex flex-wrap gap-2">
            {investment.projectLinks.map((l) => (
              <Link
                key={l.project.id}
                href={`/portal/projects/${l.project.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-inset px-3 py-1.5 text-sm font-medium text-secondary-ink hover:border-brand hover:text-brand"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="font-mono t-caption">{l.project.projectNo}</span>
                <span>{l.project.name}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="t-overline text-faint-ink">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-primary-ink">{children}</dd>
    </div>
  )
}
