import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ChargeForm from "./ChargeForm"

export const dynamic = "force-dynamic"

export default async function ChargeTransactionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const members = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      savings: { select: { amount: true, type: true } },
    },
    orderBy: { memberNo: "asc" },
  })

  // Active charge types come from the Fees & Charge Setup → Charge Type tab.
  // Only these appear in the "Charge Type" dropdown below.
  const chargeTypes = await prisma.chargeTypeConfig.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return (
    <ChargeForm
      members={members.map((m) => {
        const deposit = m.savings
          .filter((s) => s.type !== "WITHDRAWAL")
          .reduce((s, r) => s + Number(r.amount), 0)
        const withdrawal = m.savings
          .filter((s) => s.type === "WITHDRAWAL")
          .reduce((s, r) => s + Number(r.amount), 0)
        return {
          id: m.id,
          memberNo: m.memberNo,
          fullName: m.fullName,
          balance: deposit - withdrawal,
        }
      })}
      chargeTypes={chargeTypes.map((c) => ({ id: c.id, name: c.name }))}
    />
  )
}
