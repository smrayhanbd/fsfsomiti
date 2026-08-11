import prisma from "@/lib/prisma"
import Link from "next/link"
import { calculateDues } from "@/lib/dueCalculator"
import { buildProfitLoss } from "@/lib/financialStatements"
import {
  Users, Wallet, AlertTriangle, Clock, TrendingUp, TrendingDown,
  Landmark, Banknote, HandCoins, Scale, ArrowRight, Gem, Cake,
  CheckCircle, FolderKanban, BookOpen,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import PageHeader from "@/components/somiti/PageHeader"
import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SavingsGrowthChart, CollectionTrendChart, LoanRecoveryDonut,
  type TrendPoint, type LoanRecoverySlice,
} from "@/components/somiti/DashboardCharts"
import SectionCard from "@/components/somiti/SectionCard"

export const dynamic = 'force-dynamic'

// Same UTC date helpers used by lib/specialWishes — keep this dashboard's
// "today" check consistent with the wish-sending engine.
function isSameUTCDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate()
}

export default async function DashboardPage() {
  // 1. Fetch Real Data from Database
  const activeMembers = await prisma.member.count({ where: { status: "ACTIVE", deletedAt: null } })
  const pendingApprovals = await prisma.member.count({ where: { status: "PENDING", deletedAt: null } })

  const totalDepositsAgg = await prisma.savings.aggregate({
    _sum: { amount: true },
    where: { type: { notIn: ["FINE", "PENALTY"] } }
  })
  const membersTotalDeposit = Number(totalDepositsAgg._sum.amount || 0)

  const fineAgg = await prisma.savings.aggregate({ _sum: { amount: true }, where: { type: "FINE" } })
  const fineAmount = Number(fineAgg._sum.amount || 0)

  // Fetch Active Members with their Savings
  const dbMembers = await prisma.member.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    include: { savings: true },
  })

  // Fetch all fee setups to calculate dues dynamically
  const feeSetups = await prisma.feeSetup.findMany()

  // Calculate Due Balance for each member using the dynamic engine.
  // Dashboard "Members Due List" mirrors the dedicated /dashboard/due-list page
  // columns: Mem No · Member Name · Expected · Fines · Paid · Net Due · Actions.
  const membersWithDues = dbMembers.map((m) => {
    const dues = calculateDues(m.id, m.membershipDate || m.createdAt, feeSetups, m.savings)
    return {
      id: m.id,
      memberNo: m.memberNo,
      fullName: m.fullName,
      phone: m.phone,
      expected: dues.totalExpected,
      fines: dues.totalFines,
      paid: dues.totalPaid,
      netDue: dues.totalDue,
    }
  })
    .filter((m) => m.netDue > 0)
    .sort((a, b) => b.netDue - a.netDue)
    .slice(0, 10)

  const totalDynamicDue = dbMembers.reduce((acc, m) => {
    const dues = calculateDues(m.id, m.membershipDate || m.createdAt, feeSetups, m.savings)
    return acc + dues.totalDue
  }, 0)

  // ── Accounting & Operations (real numbers from the GL engine) ──
  // Cash in hand / Bank balance come from the Chart-of-Accounts:
  //   cash accounts  = Account.isCash = true  (sum of currentBalance)
  //   bank accounts  = Account.isBank = true  (sum of currentBalance)
  // Fund in investment = sum of Investment.currentValue for ACTIVE / PARTIALLY_EXITED rows.
  // Income / Expense come from buildProfitLoss for the current financial year.
  const [cashAccounts, bankAccounts, investments, loansDisbursed, plResult, festivals, membersForWishes] =
    await Promise.all([
      prisma.account.findMany({
        where: { isCash: true, status: "ACTIVE" },
        select: { currentBalance: true },
      }),
      prisma.account.findMany({
        where: { isBank: true, status: "ACTIVE" },
        select: { currentBalance: true },
      }),
      prisma.investment.findMany({
        where: { status: { in: ["ACTIVE", "PARTIALLY_EXITED"] }, isDeleted: false },
        select: { currentValue: true, costBasis: true },
      }),
      prisma.loan.findMany({
        where: { status: { in: ["DISBURSED", "DEFAULTED", "REPAID", "CLOSED", "WRITTEN_OFF"] } },
        select: {
          principalPaid: true,
          interestPaid: true,
          finePaid: true,
          outstandingBalance: true,
          totalPayable: true,
          status: true,
        },
      }),
      buildProfitLoss({
        fromDate: new Date(new Date().getFullYear(), 0, 1),
        toDate: new Date(),
      }),
      prisma.festival.findMany({ where: { isActive: true } }),
      prisma.member.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: { dateOfBirth: true, marriageDate: true, joiningDate: true, membershipDate: true },
      }),
    ])

  const cashInHand = cashAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0)
  const bankBookBalance = bankAccounts.reduce((s, a) => s + Number(a.currentBalance || 0), 0)
  const fundInInvestment = investments.reduce((s, i) => s + Number(i.currentValue || i.costBasis || 0), 0)

  const totalIncome = plResult.totalIncome
  const totalExpense = plResult.totalExpenses
  // "Total Payment to Members" = sum of savings withdrawals (a real,
  // member-facing outflow). Aggregated separately so the dashboard surfaces it.
  const withdrawalsAgg = await prisma.savings.aggregate({
    _sum: { amount: true },
    where: { type: "WITHDRAWAL" },
  })
  const totalPaymentToMembers = Number(withdrawalsAgg._sum.amount || 0)

  const totalBalanceOfSomiti = bankBookBalance + cashInHand + fundInInvestment

  // ── Loan Recovery donut: REAL recovered vs outstanding ──
  // Recovered   = principalPaid + interestPaid + finePaid  (across all disbursed lifecycle loans)
  // Outstanding = outstandingBalance                          (only currently-outstanding: DISBURSED + DEFAULTED)
  const recoveredTotal = loansDisbursed.reduce(
    (s, l) => s + Number(l.principalPaid || 0) + Number(l.interestPaid || 0) + Number(l.finePaid || 0),
    0
  )
  const outstandingTotal = loansDisbursed
    .filter((l) => ["DISBURSED", "DEFAULTED"].includes(l.status))
    .reduce((s, l) => s + Number(l.outstandingBalance || 0), 0)
  const loanRecovery: LoanRecoverySlice[] = (recoveredTotal + outstandingTotal) > 0
    ? [
        { name: "Recovered", value: recoveredTotal, color: "var(--chart-emerald)" },
        { name: "Outstanding", value: outstandingTotal, color: "var(--chart-crimson)" },
      ]
    : [
        // No loans yet — show a single neutral slice so the donut still renders
        // gracefully instead of a misleading "1 taka" placeholder.
        { name: "No Loans Yet", value: 1, color: "var(--border-base)" },
      ]

  // ── Special wishes: count today's birthdays / anniversaries / festivals ──
  const today = new Date()
  let specialWishes = 0
  for (const m of membersForWishes) {
    if (m.dateOfBirth && isSameUTCDay(m.dateOfBirth, today)) specialWishes++
    if (m.marriageDate && isSameUTCDay(m.marriageDate, today)) specialWishes++
    const joiningDate = m.joiningDate || m.membershipDate
    if (joiningDate && isSameUTCDay(joiningDate, today)) specialWishes++
  }
  for (const f of festivals) {
    if (f.month === today.getUTCMonth() + 1 && f.day === today.getUTCDate()) {
      specialWishes += activeMembers // a festival wishes every active member
    }
  }

  // Active projects (real count) and other KPIs reserved for future cards.
  const activeProjects = await prisma.project.count({
    where: { status: "ACTIVE", isDeleted: false },
  })
  void activeProjects
  void totalPaymentToMembers

  // ---- Chart data ----
  // Savings growth: last 8 months derived from real savings records.
  // IMPORTANT: we group in JS by YYYY-MM, NOT by `prisma.groupBy({ by: ["createdAt"] })`
  // (which would bucket by the exact timestamp and produce one point per row).
  const now = new Date()
  const savingsRows = await prisma.savings.findMany({
    where: {
      type: { notIn: ["FINE", "PENALTY", "WITHDRAWAL"] },
      // Only rows from the last 8 calendar months (incl. current).
      createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 7, 1) },
    },
    select: { amount: true, createdAt: true },
  })
  const monthBuckets: Record<string, number> = {}
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthBuckets[`${d.toLocaleString("en", { month: "short" })} ${String(d.getFullYear()).slice(-2)}`] = 0
  }
  for (const row of savingsRows) {
    const d = new Date(row.createdAt)
    const key = `${d.toLocaleString("en", { month: "short" })} ${String(d.getFullYear()).slice(-2)}`
    if (key in monthBuckets) monthBuckets[key] += Number(row.amount || 0)
  }
  const savingsGrowth: TrendPoint[] = Object.entries(monthBuckets).map(([label, value]) => ({ label, value }))

  // Collection trend: REAL monthly collections (last 6 months).
  // "Collections" = deposits actually received from members (excludes fines,
  // penalties, and withdrawals). Previously this was fabricated as 80% of the
  // savings series — now sourced from the same Savings ledger with a 6-month
  // window so the two charts stay related but distinct.
  const collectionRows = await prisma.savings.findMany({
    where: {
      type: { notIn: ["FINE", "PENALTY", "WITHDRAWAL"] },
      createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
    },
    select: { amount: true, createdAt: true },
  })
  const collectionBuckets: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    collectionBuckets[`${d.toLocaleString("en", { month: "short" })} ${String(d.getFullYear()).slice(-2)}`] = 0
  }
  for (const row of collectionRows) {
    const d = new Date(row.createdAt)
    const key = `${d.toLocaleString("en", { month: "short" })} ${String(d.getFullYear()).slice(-2)}`
    if (key in collectionBuckets) collectionBuckets[key] += Number(row.amount || 0)
  }
  const collectionTrend: TrendPoint[] = Object.entries(collectionBuckets).map(([label, value]) => ({ label, value }))

  // ── Real trend percentages for the KPI ribbon ──
  // Total Deposit trend = % change of this month's deposits vs last month's.
  // Active Members trend = % change in last 30 days vs the 30 days before that.
  // Both return `null` when there is no prior-period data, in which case the
  // StatCard hides the trend chip instead of showing a fabricated "+12%".
  const depositTrend = (() => {
    const thisMonth = savingsGrowth[savingsGrowth.length - 1]?.value ?? 0
    const lastMonth = savingsGrowth[savingsGrowth.length - 2]?.value ?? 0
    if (lastMonth === 0) return null
    const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
    return { value: Math.abs(pct), positive: pct >= 0 }
  })()

  const memberTrend = (() => {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(todayStart.getTime() - 60 * 24 * 60 * 60 * 1000)
    // We can't easily inline a Prisma count with two date ranges, so we'll use
    // the already-fetched dbMembers (which includes createdAt) — but dbMembers
    // only contains ACTIVE members. New activations in the window:
    const recent = dbMembers.filter(m => {
      const d = m.createdAt
      return d >= thirtyDaysAgo && d < todayStart
    }).length
    const prior = dbMembers.filter(m => {
      const d = m.createdAt
      return d >= sixtyDaysAgo && d < thirtyDaysAgo
    }).length
    if (prior === 0) return null
    const pct = Math.round(((recent - prior) / prior) * 100)
    return { value: Math.abs(pct), positive: pct >= 0 }
  })()

  // Loan recovery donut — computed above from real Loan rows (recovered vs outstanding).

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard Overview"
        subtitle="Welcome back! Here is what is happening in your foundation today."
        actions={
          <Link href="/dashboard/members/add">
            <Button className="brand-gradient shadow-brand-glow">
              <Users className="mr-2 h-4 w-4" /> Add New Member
            </Button>
          </Link>
        }
      />

      {/* ─── KPI ribbon ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Total Balance" value={<Money amount={totalBalanceOfSomiti} />} icon={Scale} accent="blue" hint="Across all funds" />
        <StatCard label="Total Deposit" value={<Money amount={membersTotalDeposit} />} icon={Wallet} accent="emerald" trend={depositTrend ?? undefined} />
        <StatCard label="Total Due" value={<Money amount={totalDynamicDue} />} icon={AlertTriangle} accent="crimson" />
        <StatCard label="Active Members" value={activeMembers.toLocaleString()} icon={Users} accent="violet" trend={memberTrend ?? undefined} />
        <StatCard label="Pending Approvals" value={pendingApprovals} icon={Clock} accent="amber" />
      </div>

      {/* ─── Charts row ─── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          icon={<TrendingUp />}
          title="Savings Growth"
          subtitle="Monthly net deposits (last 8 months)"
          action={<Link href="/dashboard/member-ledger" className="inline-flex items-center gap-1 t-caption font-semibold text-brand hover:underline">View ledger <ArrowRight className="h-3 w-3" /></Link>}
        >
          <SavingsGrowthChart data={savingsGrowth} />
        </SectionCard>

        <SectionCard
          icon={<HandCoins />}
          title="Loan Recovery"
          subtitle="Recovered vs outstanding"
        >
          <LoanRecoveryDonut data={loanRecovery} />
        </SectionCard>
      </div>

      {/* ─── Secondary KPI grid ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Cash in Hand" value={<Money amount={cashInHand} />} icon={Banknote} accent="amber" />
        <StatCard label="Bank Balance" value={<Money amount={bankBookBalance} />} icon={Landmark} accent="sky" />
        <StatCard label="Fund in Investment" value={<Money amount={fundInInvestment} />} icon={Gem} accent="violet" />
        <StatCard label="Total Income" value={<Money amount={totalIncome} />} icon={TrendingUp} accent="emerald" />
        <StatCard label="Total Expense" value={<Money amount={totalExpense} />} icon={TrendingDown} accent="crimson" />
        <StatCard label="Fine Amount Due" value={<Money amount={fineAmount} />} icon={AlertTriangle} accent="amber" />
      </div>

      {/* ─── Members Due List ─── */}
      <SectionCard
        icon={<AlertTriangle />}
        title="Members Due List"
        accent="amber"
        action={<Link href="/dashboard/due-list" className="inline-flex items-center gap-1 t-caption font-semibold text-brand hover:underline">View Full Due List <ArrowRight className="h-3 w-3" /></Link>}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="t-overline text-muted-ink">Mem No</TableHead>
                <TableHead className="t-overline text-muted-ink">Member Name</TableHead>
                <TableHead className="t-overline text-muted-ink text-right">Expected</TableHead>
                <TableHead className="t-overline text-muted-ink text-right">Fines</TableHead>
                <TableHead className="t-overline text-muted-ink text-right">Paid</TableHead>
                <TableHead className="t-overline text-muted-ink text-right">Net Due</TableHead>
                <TableHead className="t-overline text-muted-ink text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersWithDues.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={7} className="py-10 text-center">
                    <CheckCircle className="mx-auto mb-2 h-10 w-10 text-success" />
                    <p className="t-body text-muted-ink">No dues! All active members are fully paid up.</p>
                  </TableCell>
                </TableRow>
              ) : (
                membersWithDues.map((member) => (
                  <TableRow key={member.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                    <TableCell className="t-num t-caption text-muted-ink">{member.memberNo}</TableCell>
                    <TableCell className="t-subheading text-primary-ink">{member.fullName}</TableCell>
                    <TableCell className="t-num t-body text-right text-secondary-ink"><Money amount={member.expected} /></TableCell>
                    <TableCell className="t-num t-body text-right text-debit">{member.fines > 0 ? <Money amount={member.fines} /> : "—"}</TableCell>
                    <TableCell className="t-num t-body text-right text-success">{member.paid > 0 ? <Money amount={member.paid} /> : "—"}</TableCell>
                    <TableCell className="text-right"><span className="t-num t-subheading text-debit"><Money amount={member.netDue} /></span></TableCell>
                    <TableCell className="relative z-10 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="cursor-pointer rounded-md p-2 outline-none transition-colors hover:bg-subtle">
                          <svg className="h-4 w-4 text-muted-ink" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <p className="t-overline px-3 py-1.5 text-faint-ink">Due Actions</p>
                          <DropdownMenuItem className="p-0">
                            <Link href="/dashboard/collection-entry" className="flex w-full cursor-pointer items-center p-2"><Wallet className="mr-2.5 h-4 w-4" /> Receive Due</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-0">
                            <Link href={`/dashboard/member-ledger?memberId=${member.id}`} className="flex w-full cursor-pointer items-center p-2"><BookOpen className="mr-2.5 h-4 w-4" /> View Ledger</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="p-0">
                            <Link href={`/dashboard/members/${member.id}`} className="flex w-full cursor-pointer items-center p-2"><ArrowRight className="mr-2.5 h-4 w-4" /> View Profile</Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* ─── Bottom row: Collection trend + Pending + Quick actions ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-1" icon={<TrendingUp />} title="Collection Trend" subtitle="Recent months">
          <CollectionTrendChart data={collectionTrend} />
        </SectionCard>

        <SectionCard icon={<Clock />} title="Pending Approvals" subtitle="Awaiting your review">
          {pendingApprovals > 0 ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <p className="t-body text-secondary-ink">You have <span className="font-bold text-primary-ink">{pendingApprovals}</span> pending application(s).</p>
              <Link href="/dashboard/approvals" className="mt-4 inline-block">
                <Button size="sm" className="brand-gradient shadow-brand-glow">Review Now</Button>
              </Link>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
              <p className="t-body text-muted-ink">You are all caught up! No pending approvals.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Quick Actions" icon={<FolderKanban />}>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction href="/dashboard/members" icon={Users} label="Members" />
            <QuickAction href="/dashboard/members/add" icon={Users} label="Add Member" />
            <QuickAction href="/dashboard/loans" icon={HandCoins} label="Loans" />
            <QuickAction href="/dashboard/financials/profit-loss" icon={TrendingUp} label="Reports" />
          </div>
          {/* Special wishes strip */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-gradient-soft px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-[var(--brand-gold-foreground)]">
                <Cake className="h-4 w-4" />
              </span>
              <div>
                <p className="t-caption font-semibold text-primary-ink">Special Wishes</p>
                <p className="t-caption text-muted-ink">Birthdays & anniversaries today</p>
              </div>
            </div>
            <span className="t-subheading t-num text-gold">{specialWishes}</span>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-base)] p-4 transition-all hover:-translate-y-0.5 hover:border-brand hover:bg-subtle"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand transition-transform group-hover:scale-110">
        <Icon className="h-5 w-5" />
      </span>
      <span className="t-caption font-medium text-secondary-ink">{label}</span>
    </Link>
  )
}
