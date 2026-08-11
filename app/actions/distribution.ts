"use server"

// Income Distribution server actions.
//
// Lifecycle:
//   createDistribution  → DRAFT row + computed DistributionShare rows
//   postDistribution    → POSTED: voucher + Savings mirror rows (idempotent)
//   reverseDistribution → REVERSED: reversing voucher + mirror rows removed
//
// Every write is wrapped in a single `prisma.$transaction` and returns the
// discriminated ActionResult union, matching the convention in
// app/actions/investments.ts. Distribution numbers use the atomic "journal"
// Counter (DIST-######).

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/permissions"
import type { ActionResult } from "@/lib/portfolio/validation"
import { snapshotEligibleMembers } from "@/lib/distribution/snapshot"
import { calculateShares, sharesBalanceTo } from "@/lib/distribution/allocate"
import { postDistribution, reverseDistribution } from "@/lib/distribution/posting"
import { lockRow } from "@/lib/transactions/lock"
import {
  isBasis,
  isSourceType,
  type Basis,
  type SourceType,
} from "@/lib/distribution/types"

const REVALIDATE_PATHS = [
  "/dashboard/distributions",
  "/dashboard/investments",
  "/dashboard/projects",
  "/dashboard/members",
  "/dashboard/member-ledger",
  "/dashboard/accounts",
  "/dashboard/vouchers",
]

function revalidateAll() {
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p))
}

// ── Distribution number: DIST-YYYY-NNNNNN, atomic via the "distribution" counter
async function nextDistributionNo(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { id: "distribution" },
    update: { value: { increment: 1 } },
    create: { id: "distribution", value: 1 },
  })
  const year = new Date().getFullYear()
  return `DIST-${year}-${String(counter.value).padStart(4, "0")}`
}

// ── Input shapes ────────────────────────────────────────────────────────
export interface CreateDistributionInput {
  sourceType: SourceType
  investmentId?: string | null
  projectId?: string | null
  title: string
  description?: string | null
  basis: Basis
  /** ISO date string; fund shares are computed as of this date. */
  snapshotDate: string
  totalDistributable: number
  /** Required when basis === "MANUAL": weight (0–1) per memberId. */
  manualWeights?: Record<string, number> | null
  /** Investment income type, used to pick the specific income account. */
  investmentIncomeType?: string | null
}

// ── 1. Create a DRAFT distribution with computed shares ─────────────────
export async function createDistribution(
  input: CreateDistributionInput
): Promise<ActionResult> {
  // ── Validate ───────────────────────────────────────────────────────
  if (!isSourceType(input.sourceType)) return fail("Invalid source type.")
  if (!isBasis(input.basis)) return fail("Invalid basis.")
  if (!input.title?.trim()) return fail("Title is required.")
  if (!(input.totalDistributable > 0)) {
    return fail("Total distributable amount must be greater than zero.")
  }
  const snapshot = new Date(input.snapshotDate)
  if (isNaN(snapshot.getTime())) return fail("Snapshot date is invalid.")

  // Source-entity consistency: an INVESTMENT source must reference an investment, etc.
  if (input.sourceType === "INVESTMENT" && !input.investmentId) {
    return fail("An investment is required for an INVESTMENT distribution.")
  }
  if (input.sourceType === "PROJECT" && !input.projectId) {
    return fail("A project is required for a PROJECT distribution.")
  }

  const user = await getCurrentUser()
  if (!user) return fail("You must be signed in.")

  try {
    const result = await directPrisma.$transaction(async (tx) => {
      // ── Snapshot eligible members at the chosen date ───────────────
      const members = await snapshotEligibleMembers(tx, snapshot)
      if (members.length === 0) {
        throw new Error(
          "No eligible members had a fund at the snapshot date. No one to distribute to."
        )
      }

      // ── Allocate shares ────────────────────────────────────────────
      const { shares, eligibleFund } = calculateShares({
        basis: input.basis,
        totalDistributable: input.totalDistributable,
        members,
        manualWeights: input.manualWeights ?? undefined,
      })

      // Defensive: the allocator guarantees this, but verify before persisting.
      if (!sharesBalanceTo(shares, input.totalDistributable)) {
        throw new Error("Computed shares do not balance to the total. Refusing to save.")
      }

      // ── Persist the distribution + share rows ──────────────────────
      const distributionNo = await nextDistributionNo(tx)
      const distribution = await tx.incomeDistribution.create({
        data: {
          distributionNo,
          sourceType: input.sourceType,
          investmentId: input.investmentId ?? null,
          projectId: input.projectId ?? null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          basis: input.basis,
          snapshotDate: snapshot,
          totalDistributable: input.totalDistributable,
          eligibleFund,
          memberCount: shares.length,
          status: "DRAFT",
          createdBy: user.email,
          createdById: user.id,
          createdByName: user.email,
          shares: {
            create: shares.map((s) => ({
              memberId: s.memberId,
              memberNo: s.memberNo,
              memberName: s.memberName,
              fundAtSnapshot: s.fundAtSnapshot,
              weight: s.weight,
              amount: s.amount,
            })),
          },
        },
        include: { shares: { select: { id: true, memberId: true, memberName: true, amount: true } } },
      })

      return { id: distribution.id, distributionNo: distribution.distributionNo }
    })

    revalidateAll()
    // ActionResult has no distributionNo slot; carry it in voucherNo so the
    // toast can show the generated DIST- number even though no voucher exists yet.
    return { ok: true, id: result.id, voucherNo: result.distributionNo }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not create distribution.")
  }
}

// ── 2. Post a DRAFT distribution (idempotent) ───────────────────────────
export async function postDistributionAction(id: string): Promise<ActionResult> {
  if (!id) return fail("Distribution id is required.")
  const user = await getCurrentUser()
  if (!user) return fail("You must be signed in.")

  try {
    const voucherNo = await directPrisma.$transaction(async (tx) => {
      // B19: lock the IncomeDistribution row so two concurrent POST actions
      // can't both pass the "is DRAFT" check and post two vouchers, double-
      // crediting members' savings.
      await lockRow(tx, "IncomeDistribution", id)
      const dist = await tx.incomeDistribution.findUnique({
        where: { id },
        include: { shares: true, investment: { select: { name: true, investmentNo: true } } },
      })
      if (!dist) throw new Error("Distribution not found.")
      if (dist.status !== "DRAFT") {
        throw new Error(`Only a DRAFT can be posted (this one is ${dist.status}).`)
      }

      const postedAt = new Date()
      const sourceLabel =
        dist.sourceType === "INVESTMENT"
          ? dist.investment?.investmentNo ?? "investment"
          : dist.sourceType === "PROJECT"
            ? "project"
            : "general income"

      const res = await postDistribution(tx, {
        postedAt,
        narration: `${dist.title} — ${sourceLabel} distribution to ${dist.shares.length} members`,
        referenceNo: dist.distributionNo,
        sourceType: dist.sourceType,
        totalDistributable: Number(dist.totalDistributable),
        investmentIncomeType: dist.sourceType === "INVESTMENT" ? undefined : null,
        shares: dist.shares.map((s) => ({
          memberId: s.memberId,
          memberName: s.memberName,
          amount: Number(s.amount),
          distributionShareId: s.id,
        })),
      })

      // Link the voucher + mirror rows back to the distribution & shares.
      await tx.incomeDistribution.update({
        where: { id },
        data: {
          status: "POSTED",
          journalEntryId: res.journalEntryId,
          postedAt,
          postedById: user.id,
          postedByName: user.email,
        },
      })
      for (const [shareId, mirrorId] of Object.entries(res.savingsMirrorIds)) {
        await tx.distributionShare.update({
          where: { id: shareId },
          data: { savingsMirrorId: mirrorId },
        })
      }

      return res.voucherNo
    })

    revalidateAll()
    return { ok: true, id, voucherNo }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not post distribution.")
  }
}

// ── 3. Reverse a POSTED distribution ────────────────────────────────────
export async function reverseDistributionAction(
  id: string,
  reason: string
): Promise<ActionResult> {
  if (!id) return fail("Distribution id is required.")
  if (!reason?.trim()) return fail("A reversal reason is required.")
  const user = await getCurrentUser()
  if (!user) return fail("You must be signed in.")

  try {
    const reversalNo = await directPrisma.$transaction(async (tx) => {
      // B20: lock the IncomeDistribution row so two concurrent reversals
      // can't both pass the "is POSTED" check and post two reversing vouchers.
      await lockRow(tx, "IncomeDistribution", id)
      const dist = await tx.incomeDistribution.findUnique({
        where: { id },
        include: {
          shares: { select: { id: true, savingsMirrorId: true, memberId: true, amount: true } },
        },
      })
      if (!dist) throw new Error("Distribution not found.")
      if (dist.status !== "POSTED") {
        throw new Error(`Only a POSTED distribution can be reversed (this one is ${dist.status}).`)
      }
      if (!dist.journalEntryId) {
        throw new Error("Distribution has no posted voucher to reverse.")
      }

      const mirrorRows = dist.shares
        .filter((s) => s.savingsMirrorId)
        .map((s) => ({
          mirrorId: s.savingsMirrorId as string,
          memberId: s.memberId,
          amount: Number(s.amount),
        }))

      const { reversalJournalId, reversalVoucherNo } = await reverseDistribution(tx, {
        originalEntryId: dist.journalEntryId,
        reversedAt: new Date(),
        reason,
        mirrorRows,
      })

      await tx.incomeDistribution.update({
        where: { id },
        data: {
          status: "REVERSED",
          reversalJournalId,
          reversalReason: reason.trim(),
          reversedAt: new Date(),
        },
      })
      // Clear the now-deleted mirror id from each share.
      await tx.distributionShare.updateMany({
        where: { distributionId: id },
        data: { savingsMirrorId: null },
      })

      return reversalVoucherNo
    })

    revalidateAll()
    return { ok: true, id, voucherNo: reversalNo }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not reverse distribution.")
  }
}

// ── 4. Read helpers for the UI ───────────────────────────────────────────
export async function getDistribution(id: string) {
  return prisma.incomeDistribution.findUnique({
    where: { id },
    include: {
      shares: { orderBy: { amount: "desc" } },
      investment: { select: { id: true, investmentNo: true, name: true } },
      project: { select: { id: true, projectNo: true, name: true } },
      journalEntry: {
        include: { lines: { include: { account: { select: { accountName: true, accountCode: true } } } } },
      },
      reversalJournal: true,
    },
  })
}

export async function listDistributions(filters?: {
  sourceType?: SourceType
  status?: "DRAFT" | "POSTED" | "REVERSED"
}) {
  return prisma.incomeDistribution.findMany({
    where: {
      sourceType: filters?.sourceType,
      status: filters?.status,
    },
    orderBy: { createdAt: "desc" },
    include: {
      investment: { select: { investmentNo: true, name: true } },
      project: { select: { projectNo: true, name: true } },
      _count: { select: { shares: true } },
    },
  })
}

/**
 * For an investment's "Distribute" tab: how much recorded income has NOT yet
 * been distributed. = Σ income.netAmount − Σ posted shares on this investment.
 * Never negative.
 */
export async function getUndistributedInvestmentIncome(investmentId: string): Promise<number> {
  const [incomeAgg, sharesAgg] = await Promise.all([
    prisma.investmentIncome.aggregate({
      where: { investmentId },
      _sum: { netAmount: true },
    }),
    prisma.distributionShare.aggregate({
      where: {
        distribution: { investmentId, status: "POSTED" },
      },
      _sum: { amount: true },
    }),
  ])
  const income = Number(incomeAgg._sum.netAmount ?? 0)
  const distributed = Number(sharesAgg._sum.amount ?? 0)
  return Math.max(0, income - distributed)
}

/**
 * For a project's "Distribute" action: net distributable profit.
 * = Σ revenue.netAmount − Σ expense.amount, clamped to ≥ 0.
 */
export async function getDistributableProjectProfit(projectId: string): Promise<number> {
  const [revAgg, expAgg, sharesAgg] = await Promise.all([
    prisma.projectRevenue.aggregate({ where: { projectId }, _sum: { netAmount: true } }),
    prisma.projectExpense.aggregate({ where: { projectId }, _sum: { amount: true } }),
    prisma.distributionShare.aggregate({
      where: { distribution: { projectId, status: "POSTED" } },
      _sum: { amount: true },
    }),
  ])
  const revenue = Number(revAgg._sum.netAmount ?? 0)
  const expense = Number(expAgg._sum.amount ?? 0)
  const distributed = Number(sharesAgg._sum.amount ?? 0)
  return Math.max(0, revenue - expense - distributed)
}

// ── helper ──────────────────────────────────────────────────────────────
function fail(error: string): ActionResult {
  return { ok: false, error }
}

// ── 5. Preview — eligible members & their fund at a snapshot date ────────
// Used by DistributionBuilder to recompute the share table when the admin
// changes the snapshot date or total amount. Read-only.
export async function previewEligibleMembers(snapshotDate: string) {
  const d = new Date(snapshotDate)
  if (isNaN(d.getTime())) return { ok: false as const, error: "Invalid snapshot date." }
  try {
    const members = await directPrisma.$transaction((tx) => snapshotEligibleMembers(tx, d))
    return { ok: true as const, members }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not load eligible members.",
    }
  }
}
