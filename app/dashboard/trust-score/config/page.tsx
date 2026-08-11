import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import KpiConfigForm from "./KpiConfigForm"
import { getKpiConfig } from "@/lib/trustScore"

export const dynamic = "force-dynamic"

export default async function KpiConfigPage() {
  const config = await getKpiConfig(true)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Trust Score Settings
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Configure KPI weights, thresholds, and badge tiers. Changes trigger a full recalculation for every member.
          </p>
        </div>
        <Link href="/dashboard/trust-score">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Leaderboard
          </Button>
        </Link>
      </div>

      <KpiConfigForm
        config={{
          depositWeight: config.depositWeight,
          loanWeight: config.loanWeight,
          attendanceWeight: config.attendanceWeight,
          fineWeight: config.fineWeight,
          referralWeight: config.referralWeight,
          initialScore: config.initialScore,
          suspensionThreshold: config.suspensionThreshold,
          reactivationThreshold: config.reactivationThreshold,
          badgeDiamondMin: config.badgeDiamondMin,
          badgePlatinumMin: config.badgePlatinumMin,
          badgeGoldMin: config.badgeGoldMin,
          badgeSilverMin: config.badgeSilverMin,
          badgeWarningMin: config.badgeWarningMin,
          badgeHighRiskMin: config.badgeHighRiskMin,
          approvedAbsenceCounts: config.approvedAbsenceCounts,
          depositLinearInterp: config.depositLinearInterp,
          loanRecoveryMonths: config.loanRecoveryMonths,
        }}
      />
    </div>
  )
}
