"use client"

import React from "react"
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Eye, Phone, Mail, Hash, CheckCircle, Clock, XCircle, Users, RotateCcw, FileText } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"

interface ApprovalMember {
  id: string
  fullName: string
  memberNo: string
  phone: string
  email: string | null
  remarks: string | null
  createdAt: string
}

interface Props {
  pending: ApprovalMember[]
  approved: ApprovalMember[]
  rejected: ApprovalMember[]
}

function MemberTable({
  members,
  emptyTitle,
  emptyMessage,
  hrefBase,
  actionLabel,
  actionIcon,
  showRemarks = false,
}: {
  members: ApprovalMember[]
  emptyTitle: string
  emptyMessage: string
  hrefBase: string
  actionLabel: string
  actionIcon: React.ReactNode
  showRemarks?: boolean
}) {
  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft shadow-md">
          <CheckCircle className="h-8 w-8 text-success" />
        </div>
        <h3 className="t-h3 mb-2 text-primary-ink">{emptyTitle}</h3>
        <p className="max-w-sm t-body text-muted-ink">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-[var(--border-base)] hover:bg-transparent">
            <TableHead className="t-overline px-6 py-4 text-muted-ink">Member</TableHead>
            <TableHead className="t-overline px-6 py-4 text-muted-ink">Contact</TableHead>
            <TableHead className="t-overline px-6 py-4 text-muted-ink">Submitted</TableHead>
            {showRemarks && <TableHead className="t-overline px-6 py-4 text-muted-ink">Reason</TableHead>}
            <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map(member => (
            <TableRow key={member.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient-soft t-subheading font-bold text-brand ring-2 ring-[var(--glass-border)]">
                    {member.fullName.charAt(0)}
                  </div>
                  <div>
                    <p className="t-subheading text-primary-ink">{member.fullName}</p>
                    <p className="t-num t-caption mt-0.5 flex items-center gap-1 text-muted-ink"><Hash className="h-3 w-3" /> {member.memberNo}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4">
                <div className="space-y-1">
                  <p className="t-body flex items-center gap-2 text-secondary-ink"><Phone className="h-3 w-3 text-faint-ink" /> {member.phone}</p>
                  {member.email && <p className="t-caption flex items-center gap-2 text-muted-ink"><Mail className="h-3 w-3" /> {member.email}</p>}
                </div>
              </TableCell>
              <TableCell className="t-body whitespace-nowrap px-6 py-4 text-muted-ink">
                {new Date(member.createdAt).toLocaleDateString()}
              </TableCell>
              {showRemarks && (
                <TableCell className="max-w-xs px-6 py-4">
                  <p className="t-caption flex items-start gap-1.5 text-secondary-ink">
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-debit" />
                    <span className="line-clamp-2">{member.remarks || "No reason provided."}</span>
                  </p>
                </TableCell>
              )}
              <TableCell className="px-6 py-4 text-right">
                <Link href={`${hrefBase}${member.id}`}>
                  <Button type="button" size="sm" className="brand-gradient rounded-xl shadow-brand-glow transition-transform hover:scale-105">
                    {actionIcon} {actionLabel}
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function TabBadge({ count, tone }: { count: number; tone: "amber" | "emerald" | "rose" }) {
  const tones: Record<string, string> = {
    amber: "bg-warning-soft text-warning",
    emerald: "bg-success-soft text-success",
    rose: "bg-debit-soft text-debit",
  }
  return (
    <span className={`ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 t-caption font-bold ${tones[tone]}`}>
      {count}
    </span>
  )
}

export default function ApprovalsClient({ pending, approved, rejected }: Props) {
  return (
    <div className="space-y-8">
      <PageHeader

        title="Pending Approvals"
        subtitle="Review, approve, and reject member applications."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-warning bg-warning-soft px-4 py-2 shadow-sm">
            <Clock className="h-5 w-5 text-warning" />
            <span className="t-body font-bold text-warning">{pending.length} Awaiting</span>
          </div>
        }
      />

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Pending <TabBadge count={pending.length} tone="amber" />
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" /> Approved <TabBadge count={approved.length} tone="emerald" />
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1.5">
            <XCircle className="h-3.5 w-3.5" /> Rejected <TabBadge count={rejected.length} tone="rose" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <SectionCard title="Application Queue" icon={<Users />} accent="blue" bodyClassName="p-0">
            <MemberTable
              members={pending}
              emptyTitle="You're all caught up!"
              emptyMessage="There are no pending member applications right now. New requests will appear here for your approval."
              hrefBase="/dashboard/approvals/"
              actionLabel="View Application"
              actionIcon={<Eye className="mr-2 h-4 w-4" />}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <SectionCard title="Recently Approved" icon={<CheckCircle />} accent="emerald" bodyClassName="p-0">
            <MemberTable
              members={approved}
              emptyTitle="No approved members yet"
              emptyMessage="Approved members will appear here for your reference."
              hrefBase="/dashboard/members/"
              actionLabel="View Profile"
              actionIcon={<Eye className="mr-2 h-4 w-4" />}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <SectionCard title="Rejected Applications" icon={<XCircle />} accent="crimson" bodyClassName="p-0">
            <MemberTable
              members={rejected}
              emptyTitle="No rejected applications"
              emptyMessage="Rejected applications are retained here for audit history."
              hrefBase="/dashboard/members/"
              actionLabel="View Profile"
              actionIcon={<RotateCcw className="mr-2 h-4 w-4" />}
              showRemarks
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}
