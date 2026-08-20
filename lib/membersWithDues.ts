// ──────────────────────────────────────────────────────────────────────────
// Shared "members with computed dues" loader — used by the dashboard overview
// and the dedicated Due List page.
//
// PERFORMANCE: the old pattern fetched every ACTIVE member WITH their entire
// Savings history (`include: { savings: true }`) so calculateDues could sum
// payments in JS. calculateDues only ever needs ONE number per member — the
// sum of non-WITHDRAWAL savings amounts — so this loader replaces the full
// row transfer with a single `groupBy` aggregate and feeds the total into the
// same calculation as a synthetic payment row. Results are identical; the
// data transfer drops from O(all savings rows ever) to O(members).
// ──────────────────────────────────────────────────────────────────────────
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { calculateDues, type DuePayment } from "@/lib/dueCalculator"

export interface MemberDueSummary {
  totalExpected: number
  totalFines: number
  totalPaid: number
  totalDue: number
}

export interface MemberWithDues {
  id: string
  memberNo: string
  fullName: string
  firstName?: string
  phone: string
  email: string | null
  membershipDate: Date
  createdAt: Date
  dateOfBirth: Date | null
  marriageDate: Date | null
  joiningDate: Date | null
  dues: MemberDueSummary
}

/**
 * Fetch active members (per the given `where`) with their fee-setup-derived
 * dues computed in ONE parallel batch:
 *   - members (selected fields only — no savings rows)
 *   - fee setups
 *   - per-member sum of non-WITHDRAWAL savings (feeds calculateDues.totalPaid)
 *
 * `orderBy` is optional (the Due List page sorts by firstName; the dashboard
 * doesn't sort server-side).
 */
export async function loadMembersWithDues(
  where: Prisma.MemberWhereInput = { status: "ACTIVE", deletedAt: null },
  orderBy?: Prisma.MemberOrderByWithRelationInput[],
): Promise<{ members: MemberWithDues[]; feeSetups: Prisma.FeeSetupGetPayload<Record<string, never>>[] }> {
  const [memberRows, feeSetups, paidSums] = await Promise.all([
    prisma.member.findMany({
      where,
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        firstName: true,
        phone: true,
        email: true,
        membershipDate: true,
        createdAt: true,
        dateOfBirth: true,
        marriageDate: true,
        joiningDate: true,
      },
      ...(orderBy ? { orderBy } : {}),
    }),
    prisma.feeSetup.findMany(),
    prisma.savings.groupBy({
      by: ["memberId"],
      _sum: { amount: true },
      where: { type: { not: "WITHDRAWAL" } },
    }),
  ])

  const paidByMember = new Map(paidSums.map((r) => [r.memberId, Number(r._sum.amount ?? 0)]))

  const members: MemberWithDues[] = memberRows.map((m) => {
    // calculateDues sums every non-WITHDRAWAL payment row; one synthetic row
    // carrying the grouped total is arithmetically identical.
    const payments: DuePayment[] = [
      { type: "DEPOSIT", amount: paidByMember.get(m.id) ?? 0, date: m.createdAt },
    ]
    return {
      ...m,
      dues: calculateDues(m.id, m.membershipDate || m.createdAt, feeSetups, payments),
    }
  })

  return { members, feeSetups }
}
