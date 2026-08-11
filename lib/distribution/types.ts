// Shared TypeScript types & display maps for the Income Distribution module.
// Mirrors the Prisma enums in schema.prisma (DistributionSourceType /
// DistributionBasis / DistributionStatus) so the UI and actions can stay
// loosely coupled from the generated client where convenient.

import type {
  DistributionSourceType as DBSourceType,
  DistributionBasis as DBBasis,
  DistributionStatus as DBStatus,
} from "@prisma/client"

// Re-export the generated enum types for convenience.
export type SourceType = DBSourceType
export type Basis = DBBasis
export type Status = DBStatus

// Plain-string literals for action inputs (avoid importing the runtime enum
// object into client components). Validated at the server boundary.
export const SOURCE_TYPES: SourceType[] = ["INVESTMENT", "PROJECT", "GENERAL"]
export const BASES: Basis[] = ["PRO_RATA", "EQUAL", "MANUAL"]
export const STATUSES: Status[] = ["DRAFT", "POSTED", "REVERSED"]

export function isSourceType(v: unknown): v is SourceType {
  return v === "INVESTMENT" || v === "PROJECT" || v === "GENERAL"
}
export function isBasis(v: unknown): v is Basis {
  return v === "PRO_RATA" || v === "EQUAL" || v === "MANUAL"
}

// ── Display labels ──────────────────────────────────────────────────────
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  INVESTMENT: "Investment Income",
  PROJECT: "Project Profit",
  GENERAL: "General / Bank Interest",
}

export const BASIS_LABELS: Record<Basis, string> = {
  PRO_RATA: "Pro-rata by fund share",
  EQUAL: "Equal split",
  MANUAL: "Manual weights",
}

export const STATUS_LABELS: Record<Status, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  REVERSED: "Reversed",
}

// ── Snapshot result (from the snapshot engine) ──────────────────────────
export interface MemberFundSnapshot {
  memberId: string
  memberNo: string
  fullName: string
  /** Member's fund (savings balance) at the snapshot date. */
  fund: number
}

// ── Computed allocation (one row per member) ────────────────────────────
export interface ShareAllocation {
  memberId: string
  memberNo: string
  memberName: string
  /** Captured fund at snapshot — stored immutably on the share row. */
  fundAtSnapshot: number
  /** 0–1 fraction of the total. For EQUAL = 1/N. */
  weight: number
  /** This member's profit amount (BDT, 2dp). */
  amount: number
}

// ── The standard action result shape used across the app ────────────────
export type DistributionActionResult =
  | { ok: true; id?: string; distributionNo?: string; voucherNo?: string }
  | { ok: false; error: string }
