import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import InvestmentsClient from "./InvestmentsClient"

export const dynamic = "force-dynamic"

export default async function InvestmentsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const [investments, types] = await Promise.all([
    prisma.investment.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        investmentNo: true,
        name: true,
        subCategory: true,
        investedAmount: true,
        costBasis: true,
        currentValue: true,
        investmentDate: true,
        maturityDate: true,
        status: true,
        investmentType: { select: { id: true, name: true, slug: true } },
        projectLinks: { select: { id: true, project: { select: { id: true, name: true, projectNo: true } } } },
      },
    }),
    prisma.investmentType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, subCategories: true, assetAccountCode: true },
    }),
  ])

  const rows = investments.map((i) => {
    const invested = Number(i.costBasis)
    const current = Number(i.currentValue || i.costBasis)
    const gainLoss = current - invested
    const roi = invested > 0 ? (gainLoss / invested) * 100 : 0
    return {
      id: i.id,
      investmentNo: i.investmentNo,
      name: i.name,
      subCategory: i.subCategory,
      investedAmount: Number(i.investedAmount),
      costBasis: invested,
      currentValue: current,
      gainLoss,
      roi,
      investmentDate: i.investmentDate.toISOString(),
      maturityDate: i.maturityDate?.toISOString() ?? null,
      status: i.status,
      type: {
        id: i.investmentType.id,
        name: i.investmentType.name,
        slug: i.investmentType.slug,
      },
      projects: i.projectLinks.map((l) => ({
        linkId: l.id,
        id: l.project.id,
        name: l.project.name,
        projectNo: l.project.projectNo,
      })),
    }
  })

  const typeOptions = types.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    subCategories: t.subCategories as unknown as string[],
    assetAccountCode: t.assetAccountCode,
  }))

  return <InvestmentsClient rows={rows} types={typeOptions} />
}
