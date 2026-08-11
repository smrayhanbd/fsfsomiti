/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Election eligibility engine — configurable rules + snapshot generation.
// ============================================================================
// Per spec §9, §13, §14: eligibility is computed from configurable rules
// (membership status, duration, dues, suspensions, etc.) and frozen into an
// ElectionEligibility snapshot before voting opens. Super Admin can override
// any single determination with a mandatory reason (spec §14.1).
//
// The engine supports TWO independent rule sets per election:
//   • voterRules      — who can cast a ballot
//   • candidateRules  — who can submit a nomination
// Both are stored on Election.eligibilityRulesJson as { voter: {...}, candidate: {...} }.

import prisma, { directPrisma } from "@/lib/prisma"
export interface EligibilityRule {
  type:
    | "MEMBER_ACTIVE"
    | "MIN_MEMBERSHIP_MONTHS"
    | "MAX_OUTSTANDING_DUES"
    | "NOT_SUSPENDED"
    | "NOT_TERMINATED"
    | "KYC_VERIFIED"
    | "MIN_TRUST_SCORE"
    | "MIN_AGE"
    | "MAX_AGE"
  // numeric param for threshold rules (months, amount, score, age)
  value?: number
}

export interface EligibilityRules {
  rules: EligibilityRule[]
  // AND / OR combinator across rules. Default: AND (all must pass).
  combinator?: "AND" | "OR"
}

export interface ElectionEligibilityConfig {
  voter: EligibilityRules
  candidate: EligibilityRules
}

export const DEFAULT_VOTER_RULES: EligibilityRules = {
  rules: [
    { type: "MEMBER_ACTIVE" },
    { type: "NOT_SUSPENDED" },
    { type: "NOT_TERMINATED" },
  ],
  combinator: "AND",
}

export const DEFAULT_CANDIDATE_RULES: EligibilityRules = {
  rules: [
    { type: "MEMBER_ACTIVE" },
    { type: "NOT_SUSPENDED" },
    { type: "NOT_TERMINATED" },
    { type: "MIN_MEMBERSHIP_MONTHS", value: 6 },
    { type: "MIN_TRUST_SCORE", value: 60 },
  ],
  combinator: "AND",
}

export const DEFAULT_ELIGIBILITY_CONFIG: ElectionEligibilityConfig = {
  voter: DEFAULT_VOTER_RULES,
  candidate: DEFAULT_CANDIDATE_RULES,
}

// Backward-compat: old code that expected a flat EligibilityRules.
export const DEFAULT_ELIGIBILITY_RULES = DEFAULT_VOTER_RULES

export interface EligibilityDetermination {
  eligible: boolean
  reasons: string[] // empty if eligible
}

// ── Rule metadata for the UI ────────────────────────────────────────────────
export interface RuleTypeMeta {
  type: EligibilityRule["type"]
  label: string
  description: string
  hasValue: boolean
  valueLabel?: string
  valueUnit?: string
  valueMin?: number
  valueMax?: number
  valueDefault?: number
}

export const RULE_TYPES: RuleTypeMeta[] = [
  { type: "MEMBER_ACTIVE", label: "Active Member", description: "Member status must be ACTIVE", hasValue: false },
  { type: "NOT_SUSPENDED", label: "Not Suspended", description: "Member must not be suspended", hasValue: false },
  { type: "NOT_TERMINATED", label: "Not Terminated", description: "Member must not be terminated", hasValue: false },
  { type: "KYC_VERIFIED", label: "KYC Verified", description: "Member's KYC must be verified", hasValue: false },
  { type: "MIN_MEMBERSHIP_MONTHS", label: "Minimum Membership Duration", description: "Member must have been a member for at least N months", hasValue: true, valueLabel: "Months", valueUnit: "months", valueMin: 0, valueMax: 600, valueDefault: 6 },
  { type: "MIN_TRUST_SCORE", label: "Minimum Trust Score", description: "Member's trust score must be at least N (0–100)", hasValue: true, valueLabel: "Score", valueUnit: "/ 100", valueMin: 0, valueMax: 100, valueDefault: 60 },
  { type: "MAX_OUTSTANDING_DUES", label: "Max Outstanding Dues", description: "Member's outstanding dues must not exceed N BDT", hasValue: true, valueLabel: "Amount", valueUnit: "BDT", valueMin: 0, valueMax: 1000000, valueDefault: 0 },
  { type: "MIN_AGE", label: "Minimum Age", description: "Member must be at least N years old", hasValue: true, valueLabel: "Age", valueUnit: "years", valueMin: 18, valueMax: 120, valueDefault: 20 },
  { type: "MAX_AGE", label: "Maximum Age", description: "Member must be at most N years old", hasValue: true, valueLabel: "Age", valueUnit: "years", valueMin: 18, valueMax: 120, valueDefault: 60 },
]

/**
 * Determine whether a single member is eligible under the given rules.
 * Pure function — does not mutate. Reads member + ledger state from Prisma.
 */
export async function determineMemberEligibility(
  memberId: string,
  rules: EligibilityRules
): Promise<EligibilityDetermination> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      status: true,
      membershipDate: true,
      kycVerified: true,
      trustScore: true,
      dateOfBirth: true,
      savings: { select: { type: true, amount: true } },
    },
  })
  if (!member) {
    return { eligible: false, reasons: ["Member not found."] }
  }

  const results = rules.rules.map((rule) => evaluateRule(member, rule))
  const failures = results.filter((r) => !r.passed)

  const combinator = rules.combinator || "AND"
  let eligible: boolean
  if (combinator === "AND") {
    eligible = failures.length === 0
  } else {
    eligible = results.some((r) => r.passed)
  }

  return {
    eligible,
    reasons: failures.map((f) => f.reason),
  }
}

function evaluateRule(
  member: {
    status: string
    membershipDate: Date
    kycVerified: boolean
    trustScore: number
    dateOfBirth: Date | null
    savings: Array<{ type: string; amount: any }>
  },
  rule: EligibilityRule
): { passed: boolean; reason: string } {
  switch (rule.type) {
    case "MEMBER_ACTIVE":
      return member.status === "ACTIVE"
        ? { passed: true, reason: "" }
        : { passed: false, reason: "Member is not ACTIVE." }
    case "NOT_SUSPENDED":
      return member.status !== "SUSPENDED"
        ? { passed: true, reason: "" }
        : { passed: false, reason: "Member is suspended." }
    case "NOT_TERMINATED":
      return member.status !== "TERMINATED"
        ? { passed: true, reason: "" }
        : { passed: false, reason: "Member is terminated." }
    case "KYC_VERIFIED":
      return member.kycVerified
        ? { passed: true, reason: "" }
        : { passed: false, reason: "KYC not verified." }
    case "MIN_MEMBERSHIP_MONTHS": {
      const months = monthsSince(member.membershipDate)
      return months >= (rule.value || 0)
        ? { passed: true, reason: "" }
        : { passed: false, reason: `Membership duration < ${rule.value} months.` }
    }
    case "MIN_TRUST_SCORE":
      return member.trustScore >= (rule.value || 0)
        ? { passed: true, reason: "" }
        : { passed: false, reason: `Trust score below ${rule.value}.` }
    case "MAX_OUTSTANDING_DUES": {
      // Compute outstanding dues: sum of WITHDRAWAL savings minus sum of deposits.
      // (Simplified — a fuller implementation would use lib/dueCalculator.ts,
      // but this gives a reasonable approximation for the eligibility check.)
      const deposits = member.savings.filter((s) => s.type !== "WITHDRAWAL").reduce((a, s) => a + Number(s.amount), 0)
      const withdrawals = member.savings.filter((s) => s.type === "WITHDRAWAL").reduce((a, s) => a + Number(s.amount), 0)
      const outstanding = Math.max(0, withdrawals - deposits)
      return outstanding <= (rule.value || 0)
        ? { passed: true, reason: "" }
        : { passed: false, reason: `Outstanding dues ৳${outstanding} exceed ৳${rule.value}.` }
    }
    case "MIN_AGE": {
      if (!member.dateOfBirth) return { passed: false, reason: "Date of birth not set." }
      const age = yearsSince(member.dateOfBirth)
      return age >= (rule.value || 0)
        ? { passed: true, reason: "" }
        : { passed: false, reason: `Below minimum age ${rule.value}.` }
    }
    case "MAX_AGE": {
      if (!member.dateOfBirth) return { passed: true, reason: "" }
      const age = yearsSince(member.dateOfBirth)
      return age <= (rule.value || 200)
        ? { passed: true, reason: "" }
        : { passed: false, reason: `Above maximum age ${rule.value}.` }
    }
    default:
      return { passed: true, reason: "" }
  }
}

function monthsSince(date: Date): number {
  const now = new Date()
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
}

function yearsSince(date: Date): number {
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const m = now.getMonth() - date.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--
  return age
}

/**
 * Generate the eligibility snapshot for an election: evaluate every ACTIVE
 * member against the rules and persist an ElectionEligibility row per member.
 * Returns the snapshotId (a UUID) + counts.
 */
export async function generateEligibilitySnapshot(
  electionId: string,
  rules: EligibilityRules
): Promise<{ snapshotId: string; eligibleCount: number; ineligibleCount: number }> {
  const snapshotId = crypto.randomUUID()
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: { id: true },
  })

  let eligibleCount = 0
  let ineligibleCount = 0

  const BATCH = 50
  for (let i = 0; i < members.length; i += BATCH) {
    const batch = members.slice(i, i + BATCH)
    const rows: Array<{
      electionId: string
      memberId: string
      eligible: boolean
      reason: string | null
      determinedAt: Date
      snapshotId: string
    }> = []
    for (const m of batch) {
      const det = await determineMemberEligibility(m.id, rules)
      if (det.eligible) eligibleCount++
      else ineligibleCount++
      rows.push({
        electionId,
        memberId: m.id,
        eligible: det.eligible,
        reason: det.reasons.join("; ") || null,
        determinedAt: new Date(),
        snapshotId,
      })
    }
    await directPrisma.$transaction(
      rows.map((r) =>
        prisma.electionEligibility.upsert({
          where: { electionId_memberId: { electionId: r.electionId, memberId: r.memberId } },
          create: r,
          update: { eligible: r.eligible, reason: r.reason, determinedAt: r.determinedAt, snapshotId: r.snapshotId },
        })
      )
    )
  }

  return { snapshotId, eligibleCount, ineligibleCount }
}

/**
 * Resolve a member's effective eligibility for an election: snapshot
 * determination, UNLESS a Super Admin override exists (which takes precedence).
 */
export async function resolveMemberEligibility(
  electionId: string,
  memberId: string,
  ruleSet: "voter" | "candidate" = "voter"
): Promise<{ eligible: boolean; reason: string | null; overridden: boolean }> {
  const override = await prisma.electionEligibilityOverride.findUnique({
    where: { electionId_memberId: { electionId, memberId } },
  })
  if (override) {
    return {
      eligible: override.overriddenEligible,
      reason: `Admin override: ${override.reason}`,
      overridden: true,
    }
  }
  const snap = await prisma.electionEligibility.findUnique({
    where: { electionId_memberId: { electionId, memberId } },
  })
  if (snap) {
    return { eligible: snap.eligible, reason: snap.reason, overridden: false }
  }
  // No snapshot yet — fall back to live determination using the requested rule set.
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { eligibilityRulesJson: true },
  })
  const config = parseEligibilityConfig(election?.eligibilityRulesJson)
  const rules = ruleSet === "candidate" ? config.candidate : config.voter
  const det = await determineMemberEligibility(memberId, rules)
  return { eligible: det.eligible, reason: det.reasons.join("; ") || null, overridden: false }
}

/** Parse the eligibilityRulesJson from an election into a typed config. */
export function parseEligibilityConfig(json: unknown): ElectionEligibilityConfig {
  if (!json || typeof json !== "object") return DEFAULT_ELIGIBILITY_CONFIG
  const obj = json as any
  // Backward-compat: old format was a flat { rules: [...], combinator: "AND" }.
  // New format is { voter: {...}, candidate: {...} }.
  if (obj.voter || obj.candidate) {
    return {
      voter: obj.voter || DEFAULT_VOTER_RULES,
      candidate: obj.candidate || DEFAULT_CANDIDATE_RULES,
    }
  }
  // Old flat format — treat as voter rules, use default candidate rules.
  if (obj.rules) {
    return {
      voter: obj as EligibilityRules,
      candidate: DEFAULT_CANDIDATE_RULES,
    }
  }
  return DEFAULT_ELIGIBILITY_CONFIG
}

/** Backward-compat: old callers that expected a flat EligibilityRules. */
export function parseEligibilityRules(json: unknown): EligibilityRules {
  return parseEligibilityConfig(json).voter
}
