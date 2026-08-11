// Allocation calculator — turns (eligible members + a total amount + a basis)
// into a list of share amounts whose sum equals the total EXACTLY.
//
// The hard part is rounding. If the total is 20,000.00 and there are 3
// members, exact pro-rata amounts are fractional; rounding each to 2dp leaves
// "dust" (a few paisa) that must go somewhere. We always distribute dust
// deterministically so the voucher balances to the cent.

import type { Basis, MemberFundSnapshot, ShareAllocation } from "./types"

export interface AllocateInput {
  basis: Basis
  totalDistributable: number
  members: MemberFundSnapshot[]
  /** Required when basis === "MANUAL": one weight per memberId (0–1). */
  manualWeights?: Record<string, number>
}

export interface AllocateResult {
  shares: ShareAllocation[]
  /** Sum of all eligible members' fund at snapshot — stored for audit. */
  eligibleFund: number
}

const TOLERANCE = 0.005 // ½ paisa — anything tighter is float noise

/** Round to 2dp using the common round-half-up rule for currency. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Allocate `totalDistributable` across `members`.
 *
 * PRO_RATA — share ∝ fund at snapshot.
 * EQUAL    — each member gets total/N, dust spread over the first members.
 * MANUAL   — each member's weight comes from `manualWeights`; must sum to 1.
 *
 * Invariants guaranteed by the return value:
 *   • Σ shares.amount === totalDistributable (to the cent)
 *   • every share.amount >= 0
 *
 * Throws if the inputs are degenerate (no eligible members, non-positive
 * total, or manual weights that don't reconcile to 1.0).
 */
export function calculateShares(input: AllocateInput): AllocateResult {
  const { basis, totalDistributable, members } = input

  if (!(totalDistributable > 0)) {
    throw new Error("Total distributable amount must be greater than zero.")
  }
  if (members.length === 0) {
    throw new Error("No eligible members to distribute to.")
  }

  const eligibleFund = members.reduce((s, m) => s + m.fund, 0)

  // ── PRO_RATA & EQUAL both start from a weight per member ──────────────
  // Build weights, then split the total.
  let weights: { member: MemberFundSnapshot; weight: number }[]
  let largestIndex = 0 // PRO_RATA dust target = biggest contributor

  if (basis === "PRO_RATA") {
    if (eligibleFund <= 0) {
      throw new Error("Total eligible fund is zero — cannot compute pro-rata shares.")
    }
    weights = members.map((member, i) => {
      const w = member.fund / eligibleFund
      if (member.fund > members[largestIndex].fund) largestIndex = i
      return { member, weight: w }
    })
  } else if (basis === "EQUAL") {
    const w = 1 / members.length
    weights = members.map((member) => ({ member, weight: w }))
    largestIndex = 0 // dust goes to the first (largest fund, already sorted)
  } else {
    // MANUAL — validate the user-supplied weights reconcile to 1.0
    const mw = input.manualWeights ?? {}
    const sum = members.reduce((s, m) => s + Number(mw[m.memberId] ?? 0), 0)
    if (Math.abs(sum - 1) > TOLERANCE) {
      throw new Error(
        `Manual weights must sum to 1.0 (got ${sum.toFixed(6)}). Adjust them so the total is exactly 100%.`
      )
    }
    weights = members.map((member) => ({ member, weight: Number(mw[member.memberId] ?? 0) }))
  }

  // ── Convert weights to 2dp amounts, then mop up rounding dust ────────
  const raw = weights.map((w) => ({
    member: w.member,
    weight: w.weight,
    amount: round2(totalDistributable * w.weight),
  }))

  const allocated = raw.reduce((s, r) => s + r.amount, 0)
  let dust = round2(totalDistributable - allocated)

  if (Math.abs(dust) > 0) {
    // Distribute dust 1 paisa at a time. Positive dust → add to members
    // starting at largestIndex; negative dust → subtract. Stops at 0.
    const sign = dust > 0 ? 1 : -1
    let i = largestIndex
    while (Math.abs(dust) >= 0.01) {
      raw[i].amount = round2(raw[i].amount + sign * 0.01)
      dust = round2(dust - sign * 0.01)
      i = (i + 1) % raw.length
      // Guard against an absurd dust (shouldn't happen; <= N-1 paisa max)
      if (i === largestIndex && Math.abs(dust) >= 0.01) break
    }
  }

  const shares: ShareAllocation[] = raw.map((r) => ({
    memberId: r.member.memberId,
    memberNo: r.member.memberNo,
    memberName: r.member.fullName,
    fundAtSnapshot: r.member.fund,
    weight: r.weight,
    amount: r.amount,
  }))

  return { shares, eligibleFund }
}

/**
 * True if the share amounts sum exactly to `total` (within ½ paisa).
 * Used by the assert helpers and the UI save guard.
 */
export function sharesBalanceTo(shares: { amount: number }[], total: number): boolean {
  const sum = shares.reduce((s, x) => s + x.amount, 0)
  return Math.abs(sum - total) <= TOLERANCE
}
