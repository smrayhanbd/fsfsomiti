import Link from "next/link"
import { Button } from "@/components/ui/button"
import TaskForm, { type SelectOption } from "@/components/tasks/TaskForm"
import { ArrowLeft, PlusCircle } from "lucide-react"
import { getCurrentUser, hasPermission, isSuperAdmin, PERMISSIONS } from "@/lib/permissions"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Permission gate — must hold TASK_CREATE (or be SUPER_ADMIN).
  const user = await getCurrentUser()
  if (!user || !(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_CREATE, user)))) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Not authorized</h1>
        <p className="text-slate-500">You do not have permission to create tasks.</p>
        <Link href="/dashboard/tasks" className="mt-4 inline-block"><Button variant="outline">Back to Tasks</Button></Link>
      </div>
    )
  }

  // Resolve select options in parallel.
  const [staff, members, committees, tasks, meetings, loans, memberRequests, transactions] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.member.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true, memberNo: true }, orderBy: { fullName: "asc" } }),
    prisma.committee.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ select: { id: true, title: true, status: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.meeting.findMany({ select: { id: true, title: true }, orderBy: { date: "desc" }, take: 50 }),
    prisma.loan.findMany({ select: { id: true, loanNo: true }, orderBy: { loanNo: "desc" }, take: 50 }),
    prisma.memberRequest.findMany({ select: { id: true, type: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.transaction.findMany({ select: { id: true, voucherNo: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ])

  const sp = await searchParams
  // Pre-fill an integration link when navigated from a record detail page
  // (e.g. /dashboard/tasks/new?link=loanId&id=<loanId>&label=L0001).
  type LinkField = "meetingId" | "loanId" | "memberRequestId" | "transactionId" | "relatedMemberId"
  const LINK_FIELDS: LinkField[] = ["meetingId", "loanId", "memberRequestId", "transactionId", "relatedMemberId"]
  const linkFieldRaw = typeof sp.link === "string" ? sp.link : undefined
  const linkId = typeof sp.id === "string" ? sp.id : undefined
  const linkLabel = typeof sp.label === "string" ? sp.label : undefined
  const linkField: LinkField | undefined =
    linkFieldRaw && (LINK_FIELDS as string[]).includes(linkFieldRaw) ? (linkFieldRaw as LinkField) : undefined
  let defaultLink:
    | { field: LinkField; id: string; label: string }
    | undefined
  if (linkField && linkId && linkLabel) {
    defaultLink = { field: linkField, id: linkId, label: linkLabel }
  }

  const toOpts = {
    staff: staff.map<SelectOption>((s) => ({ id: s.id, label: s.name ?? s.email })),
    members: members.map<SelectOption>((m) => ({ id: m.id, label: `${m.fullName} (${m.memberNo})` })),
    committees: committees.map<SelectOption>((c) => ({ id: c.id, label: c.name })),
    tasks: tasks.map<SelectOption>((t) => ({ id: t.id, label: t.title })),
    meetings: meetings.map<SelectOption>((m) => ({ id: m.id, label: m.title })),
    loans: loans.map<SelectOption>((l) => ({ id: l.id, label: l.loanNo })),
    memberRequests: memberRequests.map<SelectOption>((r) => ({ id: r.id, label: `${r.type} request` })),
    transactions: transactions.map<SelectOption>((t) => ({ id: t.id, label: t.voucherNo })),
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/dashboard/tasks">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <PlusCircle className="h-6 w-6 text-indigo-600" /> Create Task
          </h1>
          <p className="text-sm text-slate-500">Assign work, set due dates, add checklists, reminders, and link records.</p>
        </div>
      </div>
      <TaskForm {...toOpts} defaultLink={defaultLink} />
    </div>
  )
}
