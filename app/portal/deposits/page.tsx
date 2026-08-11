import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import PortalDepositsClient from "./PortalDepositsClient"
import { calculateExpectedProfit } from "@/lib/depositProfit"

export const dynamic = "force-dynamic"

/**
 * Member Portal → Term Deposits.
 *
 * Lets a member browse the ACTIVE DepositProduct catalogue and "buy" one
 * (which delegates to applyForDeposit — creates a MemberDeposit row + a
 * linked PENDING_APPROVAL Transaction for the principal).
 *
 * Also surfaces the member's own active + matured deposits.
 */
export default async function PortalDepositsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }
  const memberId = session.user.id

  const [products, myDeposits] = await Promise.all([
    prisma.depositProduct.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ termMonths: "asc" }, { name: "asc" }],
    }),
    prisma.memberDeposit.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { name: true, code: true, profitRate: true } },
        transaction: { select: { voucherNo: true, status: true } },
      },
    }),
  ])

  // Pre-compute the expected profit at the product's minimum + max amounts so
  // the client can show a preview without re-doing the math.
  const productsWithPreview = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    termMonths: p.termMonths,
    minAmount: Number(p.minAmount),
    maxAmount: p.maxAmount ? Number(p.maxAmount) : null,
    profitRate: Number(p.profitRate),
    profitSharingRatio: Number(p.profitSharingRatio),
    maturityBehavior: p.maturityBehavior,
    previewProfitAtMin: calculateExpectedProfit(
      Number(p.minAmount),
      Number(p.profitRate),
      p.termMonths,
      Number(p.profitSharingRatio)
    ),
  }))

  return (
    <PortalDepositsClient
      products={plain(productsWithPreview)}
      myDeposits={plain(myDeposits)}
    />
  )
}
