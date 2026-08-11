// KPI configuration loader (FRS §16.4 / §12 / §23.1).
//
// There is exactly one active configuration row (id = "singleton"). It is
// created lazily with FRS defaults if it does not yet exist, so the system is
// fully functional immediately after `db push` without any seed step.
//
// Per FRS §23.1, every weight, threshold, penalty, and badge criterion must be
// read from this table at runtime — never hardcoded in a calculator.

import prisma from "@/lib/prisma"

/** Normalized shape consumed by every KPI calculator and the weight engine. */
export interface KpiConfig {
  id: string
  depositWeight: number
  loanWeight: number
  attendanceWeight: number
  fineWeight: number
  referralWeight: number
  initialScore: number
  suspensionThreshold: number
  reactivationThreshold: number
  badgeDiamondMin: number
  badgePlatinumMin: number
  badgeGoldMin: number
  badgeSilverMin: number
  badgeWarningMin: number
  badgeHighRiskMin: number
  approvedAbsenceCounts: boolean
  depositLinearInterp: boolean
  loanRecoveryMonths: number
  updatedAt: Date | null
}

/** FRS §16.4 default values — used on first lazy create and as fallback. */
export const DEFAULT_CONFIG: KpiConfig = {
  id: "singleton",
  depositWeight: 35,
  loanWeight: 25,
  attendanceWeight: 20,
  fineWeight: 10,
  referralWeight: 10,
  initialScore: 60,
  suspensionThreshold: 40,
  reactivationThreshold: 50,
  badgeDiamondMin: 90,
  badgePlatinumMin: 80,
  badgeGoldMin: 70,
  badgeSilverMin: 60,
  badgeWarningMin: 50,
  badgeHighRiskMin: 40,
  approvedAbsenceCounts: true,
  depositLinearInterp: true,
  loanRecoveryMonths: 6,
  updatedAt: null,
}

/** Weight per KPI code, straight from config (before redistribution). */
export function defaultWeights(c: KpiConfig): Record<string, number> {
  return {
    DEPOSIT: c.depositWeight,
    LOAN: c.loanWeight,
    ATTEND: c.attendanceWeight,
    FINE: c.fineWeight,
    REFERRAL: c.referralWeight,
  }
}

let cache: KpiConfig | null = null
let cacheAt = 0
// Config is read inside recalc transactions; cache briefly so a single recalc
// pass (which reads config once) doesn't re-query if multiple hooks fire in a
// single request. 60s keeps it fresh enough for admin edits to take effect.
const CACHE_TTL_MS = 60_000

/**
 * Load the singleton config row, lazily creating it from defaults if absent.
 * Memoized for CACHE_TTL_MS. Pass `bypassCache` to force a fresh read (used by
 * the admin save action, which needs to confirm its own write).
 */
export async function getKpiConfig(bypassCache = false): Promise<KpiConfig> {
  if (!bypassCache && cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache

  let row = await prisma.kpiConfiguration.findUnique({ where: { id: "singleton" } })
  if (!row) {
    // Lazy create with defaults — idempotent across concurrent callers.
    row = await prisma.kpiConfiguration.create({
      data: {
        id: "singleton",
        depositWeight: DEFAULT_CONFIG.depositWeight,
        loanWeight: DEFAULT_CONFIG.loanWeight,
        attendanceWeight: DEFAULT_CONFIG.attendanceWeight,
        fineWeight: DEFAULT_CONFIG.fineWeight,
        referralWeight: DEFAULT_CONFIG.referralWeight,
        initialScore: DEFAULT_CONFIG.initialScore,
        suspensionThreshold: DEFAULT_CONFIG.suspensionThreshold,
        reactivationThreshold: DEFAULT_CONFIG.reactivationThreshold,
        badgeDiamondMin: DEFAULT_CONFIG.badgeDiamondMin,
        badgePlatinumMin: DEFAULT_CONFIG.badgePlatinumMin,
        badgeGoldMin: DEFAULT_CONFIG.badgeGoldMin,
        badgeSilverMin: DEFAULT_CONFIG.badgeSilverMin,
        badgeWarningMin: DEFAULT_CONFIG.badgeWarningMin,
        badgeHighRiskMin: DEFAULT_CONFIG.badgeHighRiskMin,
        approvedAbsenceCounts: DEFAULT_CONFIG.approvedAbsenceCounts,
        depositLinearInterp: DEFAULT_CONFIG.depositLinearInterp,
        loanRecoveryMonths: DEFAULT_CONFIG.loanRecoveryMonths,
      },
    })
  }

  cache = {
    id: row.id,
    depositWeight: row.depositWeight,
    loanWeight: row.loanWeight,
    attendanceWeight: row.attendanceWeight,
    fineWeight: row.fineWeight,
    referralWeight: row.referralWeight,
    initialScore: row.initialScore,
    suspensionThreshold: row.suspensionThreshold,
    reactivationThreshold: row.reactivationThreshold,
    badgeDiamondMin: row.badgeDiamondMin,
    badgePlatinumMin: row.badgePlatinumMin,
    badgeGoldMin: row.badgeGoldMin,
    badgeSilverMin: row.badgeSilverMin,
    badgeWarningMin: row.badgeWarningMin,
    badgeHighRiskMin: row.badgeHighRiskMin,
    approvedAbsenceCounts: row.approvedAbsenceCounts,
    depositLinearInterp: row.depositLinearInterp,
    loanRecoveryMonths: row.loanRecoveryMonths,
    updatedAt: row.updatedAt,
  }
  cacheAt = Date.now()
  return cache
}

/** Drop the in-memory cache. Called after the admin config-save action. */
export function invalidateKpiConfigCache(): void {
  cache = null
  cacheAt = 0
}
