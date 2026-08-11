// Core types for the Trust Score engine (FRS v2.0).
// These describe the inputs and outputs of the modular scoring components in
// lib/trustScore/. See FRS §5 (KPI definitions), §6 (weights), §7 (algorithm).

/** The five KPI codes. Each has one calculator in lib/trustScore/kpis/. */
export type KpiCode = "DEPOSIT" | "LOAN" | "ATTEND" | "FINE" | "REFERRAL"

/** Event type passed into recalculateTrustScore. Maps to FRS §8 domain events. */
export type ScoreEventType =
  // Savings (§8.1)
  | "DEPOSIT_COLLECTED"
  | "DEPOSIT_DUE"
  | "DEPOSIT_OVERDUE"
  // Loan (§8.2)
  | "LOAN_APPROVED"
  | "LOAN_DISBURSED"
  | "LOAN_INSTALLMENT_PAID"
  | "LOAN_INSTALLMENT_OVERDUE"
  | "LOAN_CLOSED"
  | "LOAN_DEFAULT"
  // Attendance (§8.3)
  | "MEETING_ATTENDANCE_MARKED"
  | "MEETING_ABSENCE_RECORDED"
  // Fine (§8.4)
  | "FINE_ISSUED"
  | "FINE_PAID"
  | "FINE_WAIVED"
  // Referral (§8.5)
  | "REFERRAL_APPROVED"
  | "REFERRAL_DEACTIVATED"
  // Membership (§8.6)
  | "MEMBER_ACTIVATED"
  | "MEMBER_REACTIVATED"
  | "MEMBER_SUSPENDED"
  | "MEMBER_CONFIG_CHANGED"

/** A KPI that has been evaluated for a member. */
export interface KpiBreakdown {
  code: KpiCode
  /** Whether this KPI applies to the member (LOAN is N/A for members with no loans). */
  applicable: boolean
  /** Default weight from config. */
  defaultWeight: number
  /** Weight after redistribution (applicable KPIs only). Sums to 100. */
  redistributedWeight: number
  /** Raw points earned (0..redistributedWeight). Floored at 0. */
  score: number
  /** Maximum points achievable for this KPI (== redistributedWeight). */
  max: number
  /** Human-readable explanation of how the score was derived. */
  detail: string
}

/** Result returned by the orchestrator for a single recalculation. */
export interface TrustScoreResult {
  memberId: string
  eventType: ScoreEventType
  scoreBefore: number
  scoreAfter: number
  scoreChange: number
  badgeLevel: string
  riskLevel: string
  breakdown: KpiBreakdown[]
  achievementsEarned: { code: string; name: string }[]
  achievementsLost: { code: string; name: string }[]
  suspended: boolean
  reactivated: boolean
}
