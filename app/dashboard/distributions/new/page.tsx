import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import prisma from "@/lib/prisma"
import DistributionBuilder from "@/components/distribution/DistributionBuilder"
import {
  getUndistributedInvestmentIncome,
  getDistributableProjectProfit,
} from "@/app/actions/distribution"

export const dynamic = "force-dynamic"

// Entry point for a new distribution. Three modes via query params:
//   ?investmentId=…  → pre-fills with that investment's undistributed income,
//                      snapshot date = investment date.
//   ?projectId=…     → pre-fills with that project's distributable profit,
//                      snapshot date = project start date.
//   (neither)        → general / bank interest; admin enters total & date.
export default async function NewDistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ investmentId?: string; projectId?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const sp = await searchParams

  let sourceType: "INVESTMENT" | "PROJECT" | "GENERAL" = "GENERAL"
  let totalDistributable = 0
  let snapshotDate = new Date().toISOString().slice(0, 10)
  let titleSuggestion = "General income distribution"

  if (sp.investmentId) {
    sourceType = "INVESTMENT"
    const inv = await prisma.investment.findUnique({
      where: { id: sp.investmentId },
      select: { investmentNo: true, name: true, investmentDate: true },
    })
    totalDistributable = await getUndistributedInvestmentIncome(sp.investmentId)
    snapshotDate = inv?.investmentDate
      ? new Date(inv.investmentDate).toISOString().slice(0, 10)
      : snapshotDate
    titleSuggestion = inv ? `Income distribution — ${inv.investmentNo}` : "Investment income distribution"
  } else if (sp.projectId) {
    sourceType = "PROJECT"
    const proj = await prisma.project.findUnique({
      where: { id: sp.projectId },
      select: { projectNo: true, name: true, actualStartDate: true, plannedStartDate: true },
    })
    totalDistributable = await getDistributableProjectProfit(sp.projectId)
    const start = proj?.actualStartDate ?? proj?.plannedStartDate
    snapshotDate = start ? new Date(start).toISOString().slice(0, 10) : snapshotDate
    titleSuggestion = proj ? `Profit distribution — ${proj.projectNo}` : "Project profit distribution"
  }

  return (
    <DistributionBuilder
      defaults={{
        sourceType,
        investmentId: sp.investmentId ?? null,
        projectId: sp.projectId ?? null,
        snapshotDate,
        totalDistributable,
        lockedSource: !!sp.investmentId || !!sp.projectId,
        titleSuggestion,
        backHref:
          sp.investmentId ? `/dashboard/investments/${sp.investmentId}`
          : sp.projectId ? `/dashboard/projects/${sp.projectId}`
          : "/dashboard/distributions",
      }}
    />
  )
}

