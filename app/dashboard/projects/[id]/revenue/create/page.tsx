import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectRevenueForm from "./ProjectRevenueForm"

export const dynamic = "force-dynamic"

export default async function RecordProjectRevenuePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, projectNo: true, name: true },
  })
  if (!project) notFound()

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { accountName: "asc" },
    select: { id: true, accountName: true, bankName: true },
  })

  return (
    <ProjectRevenueForm
      project={{ id: project.id, projectNo: project.projectNo, name: project.name }}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
    />
  )
}
