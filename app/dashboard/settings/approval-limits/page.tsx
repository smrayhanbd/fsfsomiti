import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import ApprovalLimitsForm from "./ApprovalLimitsForm"

export const dynamic = "force-dynamic"

export default async function ApprovalLimitsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const limits = await prisma.approvalLimit.findMany({
    orderBy: { minAmount: "asc" },
  })

  return (
    <ApprovalLimitsForm
      limits={limits.map((l) => ({
        id: l.id,
        level: l.level,
        label: l.label,
        role: l.role as "ADMIN" | "SUPER_ADMIN",
        permission: l.permission,
        minAmount: Number(l.minAmount),
        maxAmount: Number(l.maxAmount),
        isActive: l.isActive,
      }))}
    />
  )
}
