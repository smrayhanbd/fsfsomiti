import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { calculateDues } from "@/lib/dueCalculator"
import Sparkline from "@/components/portal/Sparkline"
import {
  Wallet, TrendingUp, AlertTriangle, Receipt, CalendarDays, MapPin,
  ArrowRight, HandCoins, BadgeCheck, Clock, FilePlus2,
} from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import SectionCard from "@/components/somiti/SectionCard"
import StatusBadge from "@/components/somiti/StatusBadge"

export const dynamic = "force-dynamic"

const SAVINGS_TYPE_TONES: Record<string, string> = {
  WITHDRAWAL: "bg-debit-soft text-debit border-debit",
  FINE: "bg-warning-soft text-warning border-warning",
  LOAN_PAYMENT: "bg-info-soft text-info border-info",
}

export default async function PortalDashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  const [member, meetings, feeSetups, activeLoans] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      include: { savings: { orderBy: { date: "desc" } } },
    }),
    prisma.meeting.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 3,
    }),
    prisma.feeSetup.findMany(),
    prisma.loan.findMany({
      where: { memberId, status: { in: ["DISBURSED", "DEFAULTED"] } },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  if (!member) redirect("/")

  // --- Financials ---
  const joinDate = member.membershipDate || member.createdAt
  const dues = calculateDues(member.id, joinDate, feeSetups, member.savings)

  const totalDeposit = member.savings.filter((s) => s.type !== "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings.filter((s) => s.type === "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposit - totalWithdrawal

  // --- Sparkline: deposits over the last 6 months ---
  const trend = buildMonthlyTrend(member.savings, 6)

  const totalOutstanding = activeLoans.reduce((acc, l) => acc + Number(l.outstandingBalance), 0)
  const nextDue = activeLoans
    .map((l) => l.nextDueDate)
    .filter(Boolean)
    .sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0]
  const recentSavings = member.savings.slice(0, 5)
  const firstName = member.fullName.split(" ")[0]

  return (
    <div className="space-y-8">
      {/* Welcome / hero header */}
      <div className="relative overflow-hidden rounded-[1.5rem] brand-gradient shadow-pop">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-[var(--gradient-gold)]/30 blur-3xl" />
        </div>
        <div className="relative flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex items-center gap-4">
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={member.photoUrl}
                alt={member.fullName}
                className="h-16 w-16 rounded-2xl object-cover shadow-lg ring-4 ring-white/30 sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white shadow-lg ring-4 ring-white/30 backdrop-blur sm:h-20 sm:w-20 sm:text-3xl">
                {firstName.charAt(0)}
              </div>
            )}
            <div className="text-white">
              <p className="t-overline text-white/80">Welcome back</p>
              <h1 className="t-h1">{firstName}!</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 t-num t-caption font-medium backdrop-blur">
                  {member.memberNo}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 t-caption font-medium ${
                  member.status === "ACTIVE" ? "bg-emerald-400/25 text-emerald-50" : "bg-amber-400/25 text-amber-50"
                }`}>
                  {member.status}
                </span>
                {member.kycVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 t-caption font-medium backdrop-blur">
                    <BadgeCheck className="h-3 w-3" /> KYC Verified
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="hidden text-right text-white sm:block">
            <p className="t-overline text-white/80">Member since</p>
            <p className="t-h3">
              {new Date(joinDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
            <Link href="/portal/loans/apply">
              <Button className="mt-2 bg-white text-brand hover:bg-white/90" size="sm">
                <FilePlus2 className="mr-1.5 h-4 w-4" /> Apply for Loan
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current Balance" value={<Money amount={currentBalance} />} icon={Wallet} accent="emerald" />
        <StatCard label="Total Deposited" value={<Money amount={Number(dues.totalPaid)} />} icon={TrendingUp} accent="blue" />
        <StatCard label="Late Fines" value={<Money amount={Number(dues.totalFines)} />} icon={AlertTriangle} accent="crimson" />
        <StatCard label="Net Due Balance" value={<Money amount={Number(dues.totalDue)} />} icon={Receipt} accent="amber" />
      </div>

      {/* Savings trend + active loans summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Savings Trend"
          subtitle="Last 6 months"
          icon={<TrendingUp />}
          action={
            <Link href="/portal/savings">
              <Button variant="ghost" size="sm" className="text-brand hover:bg-brand-gradient-soft">
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        >
          <Sparkline data={trend} height={64} />
        </SectionCard>

        <SectionCard title="Active Loans" icon={<HandCoins />} accent="gold">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-inset p-3">
                <p className="t-overline text-faint-ink">Outstanding</p>
                <Money amount={totalOutstanding} className="mt-0.5 t-h3 block text-debit" />
              </div>
              <div className="rounded-xl bg-inset p-3">
                <p className="t-overline text-faint-ink">Active Loans</p>
                <p className="mt-0.5 t-h3 t-num text-primary-ink">{activeLoans.length}</p>
              </div>
            </div>
            {nextDue && (
              <div className="flex items-center gap-2 t-caption text-secondary-ink">
                <Clock className="h-3.5 w-3.5 text-warning" />
                Next installment due:{" "}
                <span className="font-semibold">
                  {new Date(nextDue).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            )}
            <Link href="/portal/loans">
              <Button variant="outline" className="w-full" size="sm">
                Manage loans <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Lower split: meetings + recent transactions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming Meetings */}
        <SectionCard title="Upcoming Meetings" icon={<CalendarDays />}>
          <div className="space-y-3">
            {meetings.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarDays className="mx-auto mb-2 h-8 w-8 text-faint-ink" />
                <p className="t-body text-muted-ink">No upcoming meetings scheduled.</p>
              </div>
            ) : (
              meetings.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-[var(--border-base)] bg-inset transition-colors hover:border-brand"
                >
                  <div className="p-4">
                    <h4 className="t-subheading text-primary-ink">{m.title}</h4>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 t-caption text-muted-ink">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      {m.location && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {m.location}
                        </span>
                      )}
                    </div>
                    {m.agenda && <p className="mt-2 line-clamp-2 t-caption text-secondary-ink">{m.agenda}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {/* Recent Transactions */}
        <SectionCard
          title="Recent Transactions"
          icon={<Receipt />}
          action={
            <Link href="/portal/savings">
              <Button variant="ghost" size="sm" className="text-brand hover:bg-brand-gradient-soft">
                All <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          }
          bodyClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Date</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Type</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSavings.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={3} className="py-10 text-center t-body text-muted-ink">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentSavings.map((sav) => (
                  <TableRow key={sav.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                    <TableCell className="px-6 py-3 t-body text-secondary-ink">
                      {new Date(sav.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="px-6 py-3">
                      <Badge variant="outline" className={SAVINGS_TYPE_TONES[sav.type] || "bg-subtle text-secondary-ink border-[var(--border-base)]"}>
                        {sav.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className={`px-6 py-3 text-right t-num font-bold ${sav.type === "WITHDRAWAL" ? "text-debit" : "text-success"}`}>
                      {sav.type === "WITHDRAWAL" ? "− " : "+ "}<Money amount={Number(sav.amount)} symbol={false} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </div>
  )
}

// Build a { label, value }[] series of deposit totals per month, for the last `months` months.
function buildMonthlyTrend(
  savings: { amount: unknown; type: string; date: Date }[],
  months: number
): { label: string; value: number }[] {
  const now = new Date()
  const buckets: { key: string; label: string; value: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString(undefined, { month: "short" }),
      value: 0,
    })
  }
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const s of savings) {
    if (s.type === "WITHDRAWAL") continue
    const d = new Date(s.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const i = index.get(key)
    if (i !== undefined) buckets[i].value += Number(s.amount)
  }
  return buckets.map((b) => ({ label: b.label, value: b.value }))
}
