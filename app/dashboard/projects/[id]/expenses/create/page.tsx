import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectExpenseForm from "./ProjectExpenseForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function RecordProjectExpensePage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Project Management")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, projectNo: true, name: true },
  })
  if (!project) notFound()

  const [costCenters, bankAccounts] = await Promise.all([
    prisma.projectCostCenter.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { accountName: "asc" }, select: { id: true, accountName: true, bankName: true } }),
  ])

  return (
    <ProjectExpenseForm
      project={{ id: project.id, projectNo: project.projectNo, name: project.name }}
      costCenters={costCenters.map((c) => ({ id: c.id, name: c.name }))}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
    />
  )
}
