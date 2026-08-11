// Public API for the Trust Score engine.
// Import from "@/lib/trustScore" rather than reaching into submodules.

export { recalculateTrustScore } from "./recalculate"
export { getKpiConfig, invalidateKpiConfigCache, DEFAULT_CONFIG } from "./config"
export type { KpiConfig } from "./config"
export { loadMemberContext } from "./context"
export type { MemberContext } from "./context"
export { assignBadgeLevel, assignRiskLevel, evaluateAchievements } from "./badges"
export { generateSuggestions } from "./suggestions"
export type { Suggestion } from "./suggestions"
export { getScoreView } from "./view"
export type { ScoreView } from "./view"
export { computeRedistributedWeights } from "./weights"
export type { KpiCode, KpiBreakdown, TrustScoreResult, ScoreEventType } from "./types"
