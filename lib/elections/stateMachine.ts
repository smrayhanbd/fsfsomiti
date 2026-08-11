// ============================================================================
// Election state machine — controls legal status transitions.
// ============================================================================
// Per spec §6 + §96. Each transition is guarded; illegal transitions throw.
// The FROZEN state stores previousStatus and reverts on unfreeze.

import type { ElectionStatus } from "@prisma/client"

export interface TransitionResult {
  from: ElectionStatus
  to: ElectionStatus
  allowed: boolean
  reason?: string
}

const FORWARD: Record<ElectionStatus, ElectionStatus | null> = {
  DRAFT: "NOMINATION_OPEN",
  NOMINATION_OPEN: "NOMINATION_CLOSED",
  NOMINATION_CLOSED: "CANDIDATES_FINALIZED",
  CANDIDATES_FINALIZED: "VOTING_SCHEDULED",
  VOTING_SCHEDULED: "VOTING_OPEN",
  VOTING_OPEN: "VOTING_CLOSED",
  VOTING_CLOSED: "COUNTING",
  COUNTING: "RESULTS_READY",
  RESULTS_READY: "RESULTS_PUBLISHED",
  RESULTS_PUBLISHED: "COMMITTEE_FORMED",
  COMMITTEE_FORMED: "ARCHIVED",
  ARCHIVED: null,
  CANCELLED: null,
  FROZEN: null,
  RUNOFF_REQUIRED: "RESULTS_PUBLISHED",
}

/** Check whether a transition is legal. */
export function canTransition(from: ElectionStatus, to: ElectionStatus): TransitionResult {
  if (from === to) return { from, to, allowed: false, reason: "Already in that status." }

  // FROZEN handling: from FROZEN, only unfreeze (back to previousStatus) is allowed.
  if (from === "FROZEN") {
    return {
      from,
      to,
      allowed: false,
      reason: "Election is frozen. Unfreeze it first to resume operations.",
    }
  }

  // CANCELLED is terminal.
  if (from === "CANCELLED") {
    return { from, to, allowed: false, reason: "Election is cancelled." }
  }

  // ARCHIVED is terminal.
  if (from === "ARCHIVED") {
    return { from, to, allowed: false, reason: "Election is archived." }
  }

  // Any non-terminal state can be FROZEN or CANCELLED.
  if (to === "FROZEN" || to === "CANCELLED") {
    return { from, to, allowed: true }
  }

  // RUNOFF_REQUIRED is set during counting when a tie is detected.
  if (to === "RUNOFF_REQUIRED") {
    return { from, to, allowed: from === "COUNTING" || from === "RESULTS_READY" }
  }

  // Forward transitions follow the canonical lifecycle.
  const expected = FORWARD[from]
  if (expected === to) return { from, to, allowed: true }

  // Reopen voting: VOTING_CLOSED → VOTING_OPEN (Super Admin only, before deadline).
  if (from === "VOTING_CLOSED" && to === "VOTING_OPEN") {
    return { from, to, allowed: true, reason: "Reopen voting (Super Admin)." }
  }

  return {
    from,
    to,
    allowed: false,
    reason: `Illegal transition: ${from} → ${to}.`,
  }
}

/** Assert a transition is legal; throw with a descriptive message if not. */
export function assertTransition(from: ElectionStatus, to: ElectionStatus): void {
  const r = canTransition(from, to)
  if (!r.allowed) {
    throw new Error(r.reason || `Illegal status transition: ${from} → ${to}.`)
  }
}

/**
 * Is the election in a state where configuration (positions, rules) is editable?
 * Per §96: editable only in DRAFT and (limited) NOMINATION_OPEN.
 */
export function isConfigEditable(status: ElectionStatus): boolean {
  return status === "DRAFT" || status === "NOMINATION_OPEN"
}

/** Is the election in a state where voting is open? */
export function isVotingOpen(status: ElectionStatus): boolean {
  return status === "VOTING_OPEN"
}

/** Is the election in a pre-voting state (nominations / configuration)? */
export function isPreVoting(status: ElectionStatus): boolean {
  return (
    status === "DRAFT" ||
    status === "NOMINATION_OPEN" ||
    status === "NOMINATION_CLOSED" ||
    status === "CANDIDATES_FINALIZED" ||
    status === "VOTING_SCHEDULED"
  )
}

/** Is the election in a post-voting (locked) state? */
export function isPostVoting(status: ElectionStatus): boolean {
  return (
    status === "VOTING_CLOSED" ||
    status === "COUNTING" ||
    status === "RESULTS_READY" ||
    status === "RUNOFF_REQUIRED" ||
    status === "RESULTS_PUBLISHED" ||
    status === "COMMITTEE_FORMED" ||
    status === "ARCHIVED"
  )
}

/** Is the election terminal (no further forward transitions)? */
export function isTerminal(status: ElectionStatus): boolean {
  return status === "ARCHIVED" || status === "CANCELLED"
}
