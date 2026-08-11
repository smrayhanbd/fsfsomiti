// Member context loader (FRS §7 step 1–3).
//
// Gathers every piece of raw data the KPI calculators need in a single batch,
// so each calculator is a pure function over this bundle (no per-KPI queries).
// This keeps recalculation well under the 500ms SLA (FRS §19).

import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { calculateDues } from "@/lib/dueCalculator"

// FeeSetup payload type — matches what prisma.feeSetup.findMany returns.
type FeeSetup = Prisma.FeeSetupGetPayload<Record<string, never>>

/** A single deposit cycle due: when it was due and whether it was paid on time. */
export interface DepositCycle {
  dueDate: Date
  /** Best payment made against this cycle, or null if unpaid. */
  paidDate: Date | null
  /** Days the payment was late (0 if on-time, >0 if overdue, undefined if unpaid). */
  daysLate: number | null
}

/** Raw data bundle used by all KPI calculators. */
export interface MemberContext {
  member: {
    id: string
    status: string
    membershipDate: Date
    createdAt: Date
    referredByMemberId: string | null
    trustScore: number
    badgeLevel: string
    riskLevel: string
    scoreLastUpdated: Date | null
  }
  /** All savings rows for the member (deposits, fines, withdrawals, loan payments). */
  savings: Array<{
    id: string
    type: string
    amount: Prisma.Decimal
    date: Date
    method: string
    receiptNo: string | null
  }>
  /** All loans for the member, with their full schedules. */
  loans: Array<{
    id: string
    status: string
    updatedAt: Date
    schedule: Array<{
      installmentNo: number
      dueDate: Date
      status: string
      paidDate: Date | null
      installmentAmount: Prisma.Decimal
      principal: Prisma.Decimal
      interest: Prisma.Decimal
    }>
  }>
  /** All attendance rows for the member. */
  attendance: Array<{ status: string; markedAt: Date; meetingId: string }>
  /** All fine rows for the member (active + resolved). */
  fines: Array<{
    id: string
    status: string
    issuedDate: Date
    amount: Prisma.Decimal
    fineType: { typeName: string; penaltyPoints: number }
  }>
  /** All members referred by this member. */
  referrals: { id: string; status: string }[]
  /** Deposit cycles reconstructed from fee setups + payments. */
  depositCycles: DepositCycle[]
  /** Aggregated due figures from lib/dueCalculator. */
  dues: { totalExpected: number; totalFines: number; totalPaid: number; totalDue: number }
  /** Total meetings declared org-wide (0 → ATTEND KPI defaults to full weight). */
  totalMeetingsHeld: number
}

/**
 * Load the full scoring context for a member. Returns null if the member does
 * not exist. The depositCycles are reconstructed here (once) and shared with
 * the DEPOSIT calculator to avoid recomputation.
 */
export async function loadMemberContext(memberId: string): Promise<MemberContext | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      status: true,
      membershipDate: true,
      createdAt: true,
      referredByMemberId: true,
      trustScore: true,
      badgeLevel: true,
      riskLevel: true,
      scoreLastUpdated: true,
    },
  })
  if (!member) return null

  const [savings, loans, attendance, fines, referrals, feeSetups, allMeetingsCount] =
    await Promise.all([
      prisma.savings.findMany({ where: { memberId }, orderBy: { date: "asc" } }),
      prisma.loan.findMany({
        where: { memberId },
        include: { schedule: { orderBy: { installmentNo: "asc" } } },
      }),
      prisma.meetingAttendance.findMany({ where: { memberId }, include: { meeting: true } }),
      prisma.fine.findMany({
        where: { memberId },
        include: { fineType: { select: { typeName: true, penaltyPoints: true } } },
      }),
      prisma.member.findMany({
        where: { referredByMemberId: memberId },
        select: { id: true, status: true },
      }),
      prisma.feeSetup.findMany(),
      prisma.meeting.count(),
    ])

  const joinDate = member.membershipDate || member.createdAt
  // calculateDues accepts any[] for payments, so no cast is needed.
  const dues = calculateDues(member.id, joinDate, feeSetups, savings)
  const depositCycles = buildDepositCycles(member.id, joinDate, feeSetups, savings)

  return {
    member,
    savings,
    loans,
    attendance,
    fines,
    referrals,
    depositCycles,
    dues,
    totalMeetingsHeld: allMeetingsCount,
  }
}

/**
 * Reconstruct per-cycle deposit due dates and on-time status from fee setups
 * and the member's payment history. Mirrors the cycle logic in
 * lib/dueCalculator.ts so "on-time" is judged against the same due dates the
 * due-list uses. Only deposit-type Savings rows (excludes WITHDRAWAL / FINE /
 * LOAN_PAYMENT / PENALTY) are matched against cycles.
 */
function buildDepositCycles(
  memberId: string,
  joinDate: Date,
  setups: FeeSetup[],
  savings: MemberContext["savings"]
): DepositCycle[] {
  const deposits = savings.filter(
    (s) => !["WITHDRAWAL", "FINE", "PENALTY", "LOAN_PAYMENT"].includes(s.type)
  )
  const sortedDeposits = [...deposits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const stripTime = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  const now = stripTime(new Date())
  const cleanJoin = stripTime(new Date(joinDate))
  const cycles: { dueDate: Date }[] = []

  // Group setups by name and expand each into its due-date timeline, exactly
  // as calculateDues does, but we only need the due dates (not the amounts).
  const byType: Record<string, FeeSetup[]> = {}
  for (const s of setups) {
    ;(byType[s.name] ||= []).push(s)
  }

  for (const type in byType) {
    const list = byType[type].sort(
      (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
    )
    for (let i = 0; i < list.length; i++) {
      const setup = list[i]
      const next = list[i + 1]
      if (setup.targetType === "SPECIFIC") {
        const ids = setup.targetMemberIds ? JSON.parse(setup.targetMemberIds) : []
        if (!ids.includes(memberId)) continue
      }

      const periodStart = stripTime(new Date(setup.effectiveDate))
      const periodEnd = next ? stripTime(new Date(next.effectiveDate)) : now
      if (periodStart > periodEnd) continue

      const cursor = new Date(periodStart.getTime())
      const isLast = !next
      let guard = 0
      while (isLast ? cursor <= periodEnd : cursor < periodEnd) {
        if (++guard > 1200) break
        const due = new Date(cursor.getTime())
        const dueDay = Number(setup.dueDay)
        if (setup.frequency === "WEEKLY") {
          const diff = (dueDay - due.getDay() + 7) % 7
          due.setDate(due.getDate() + diff)
        } else if (setup.frequency === "MONTHLY") {
          const dim = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()
          due.setDate(Math.min(dueDay, dim))
        } else {
          due.setDate(due.getDate() + dueDay)
        }
        const cleanDue = stripTime(due)
        if (cleanDue >= cleanJoin) cycles.push({ dueDate: cleanDue })

        if (setup.frequency === "WEEKLY") cursor.setDate(cursor.getDate() + 7)
        else if (setup.frequency === "MONTHLY") cursor.setMonth(cursor.getMonth() + 1)
        else if (setup.frequency === "QUARTERLY") cursor.setMonth(cursor.getMonth() + 3)
        else if (setup.frequency === "HALF_YEARLY") cursor.setMonth(cursor.getMonth() + 6)
        else if (setup.frequency === "YEARLY") cursor.setFullYear(cursor.getFullYear() + 1)
        else break
      }
    }
  }

  cycles.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

  // Greedily match each cycle's due date to the earliest remaining deposit on
  // or after the cycle's due month. A deposit dated before its due date still
  // counts as on-time (payment received on or before the scheduled due date).
  const used = new Set<number>()
  return cycles.map((c) => {
    // Allow matching a deposit up to 45 days before the due date (early pay).
    const windowStart = new Date(c.dueDate)
    windowStart.setDate(windowStart.getDate() - 45)
    let best: { deposit: MemberContext["savings"][number]; diff: number } | null = null
    for (let idx = 0; idx < sortedDeposits.length; idx++) {
      if (used.has(idx)) continue
      const pd = stripTime(new Date(sortedDeposits[idx].date))
      if (pd < windowStart) continue
      if (pd > now) break
      const diff = Math.floor((pd.getTime() - c.dueDate.getTime()) / 86_400_000)
      best = { deposit: sortedDeposits[idx], diff }
      used.add(idx)
      break
    }
    return {
      dueDate: c.dueDate,
      paidDate: best ? new Date(best.deposit.date) : null,
      daysLate: best ? Math.max(0, best.diff) : null,
    }
  })
}
