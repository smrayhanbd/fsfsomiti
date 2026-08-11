"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
// `payload` is an arbitrary JSON object read from the ProfileUpdateRequest.payload
// (Prisma `Json` column), so it is intentionally typed loosely for rendering.

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  approveProfileUpdateRequest,
  rejectProfileUpdateRequest,
} from "@/app/actions/portal"
import { toast } from "sonner"
import { formatDate } from "@/lib/accounting"
import {
  CheckCircle2,
  XCircle,
  UserCog,
  Hash,
  User,
  ExternalLink,
} from "lucide-react"

export interface ProfileApprovalItem {
  id: string
  payload: Record<string, any>
  status: string
  createdAt: string
  member: {
    id: string
    memberNo: string
    fullName: string
    phone: string | null
    email: string | null
    photoUrl: string | null
  }
}

// Friendly labels for the raw payload keys stored in ProfileUpdateRequest.payload
// (legacy flat payloads only). Structured payloads are summarized below.
const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone",
  email: "Email",
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  spouseName: "Spouse's Name",
  occupation: "Occupation",
  profession: "Profession",
  photoUrl: "New Photo",
}

// Friendly labels for the structured (full) payload sub-keys.
const PERSONAL_LABELS: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", fatherName: "Father", motherName: "Mother",
  spouseName: "Spouse", dateOfBirth: "DOB", gender: "Gender", maritalStatus: "Marital Status",
  marriageDate: "Marriage Date", religion: "Religion", nationality: "Nationality",
  bloodGroup: "Blood Group", profession: "Profession",
}
const CONTACT_LABELS: Record<string, string> = {
  phone: "Phone", email: "Email", emergencyPhone: "Emergency Phone",
  emergencyContactName: "Emergency Contact", idType: "ID Type", idNumber: "ID Number",
}
const BANK_LABELS: Record<string, string> = {
  accountName: "Account Name", accountNumber: "Account No", bankName: "Bank",
  branch: "Branch", routingNumber: "Routing",
}

// Turn a structured payload into a flat list of [label, value] summary chips.
function summarizeStructuredPayload(payload: Record<string, any>): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const push = (label: string, value: any) => {
    if (value === null || value === undefined || value === "") return
    out.push([label, String(value)])
  }

  const personal = payload.personal || {}
  Object.entries(PERSONAL_LABELS).forEach(([k, label]) => {
    if (personal[k] !== undefined) {
      if (k === "bloodGroup") {
        push(label, String(personal[k]).replace("_POSITIVE", "+").replace("_NEGATIVE", "-"))
      } else {
        push(label, personal[k])
      }
    }
  })

  const contact = payload.contact || {}
  Object.entries(CONTACT_LABELS).forEach(([k, label]) => {
    if (contact[k] !== undefined) push(label, contact[k])
  })

  const bank = payload.bank || {}
  const bankHas = Object.values(bank).some((v) => v)
  if (bankHas) {
    Object.entries(BANK_LABELS).forEach(([k, label]) => {
      if (bank[k] !== undefined) push(label, bank[k])
    })
  }

  if (payload.currentAddress && (payload.currentAddress.village || payload.currentAddress.district)) {
    const a = payload.currentAddress
    push("Current Addr", [a.village, a.district].filter(Boolean).join(", "))
  }
  if (payload.permanentAddress && (payload.permanentAddress.village || payload.permanentAddress.district)) {
    const a = payload.permanentAddress
    push("Permanent Addr", [a.village, a.district].filter(Boolean).join(", "))
  }

  if (Array.isArray(payload.nominees) && payload.nominees.length > 0) {
    push("Nominees", payload.nominees.map((n: any) => `${n.name} (${n.share || 0}%)`).join(", "))
  }

  if (payload.memberPhotoUrl) out.push(["New Photo", payload.memberPhotoUrl])
  if (payload.idDocumentUrl) out.push(["New ID Document", payload.idDocumentUrl])

  return out
}

function isStructuredPayload(payload: Record<string, any>): boolean {
  return Boolean(payload && (payload.personal || payload.contact || payload.bank || payload.nominees))
}

interface Props {
  items: ProfileApprovalItem[]
}

export default function ApprovalsClient({ items }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending")

  const pending = items.filter((i) => i.status === "PENDING")
  const approved = items.filter((i) => i.status === "APPROVED")
  const rejected = items.filter((i) => i.status === "REJECTED")

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const res = await approveProfileUpdateRequest(id)
      if (res.ok) {
        toast.success("Profile update approved")
        router.refresh()
      } else {
        toast.error("Cannot approve", { description: res.error })
      }
    })
  }

  const handleReject = (id: string) => {
    const reason = prompt("Rejection reason? (optional)")
    startTransition(async () => {
      const res = await rejectProfileUpdateRequest(
        id,
        reason && reason.trim() ? reason.trim() : undefined
      )
      if (res.ok) {
        toast.success("Profile update rejected")
        router.refresh()
      } else {
        toast.error("Failed", { description: res.error })
      }
    })
  }

  const renderRow = (r: ProfileApprovalItem) => {
    // Normalize to a flat [label, value] summary, whether the payload is the
    // legacy flat string map or the new structured payload.
    const changes: Array<[string, string]> = isStructuredPayload(r.payload || {})
      ? summarizeStructuredPayload(r.payload || {})
      : Object.entries(r.payload || {})
          .filter(([k]) => k !== "rejectReason")
          .map(([k, v]) => [FIELD_LABELS[k] ?? k, String(v)] as [string, string])
    return (
      <TableRow key={r.id}>
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
              {r.member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.member.photoUrl}
                  alt={r.member.fullName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {r.member.fullName}
              </p>
              <p className="text-[11px] text-slate-400">
                {r.member.memberNo}
                {r.member.phone ? ` · ${r.member.phone}` : ""}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          {changes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-w-md">
              {changes.map(([label, val]) => {
                const isPhoto = label === "New Photo" || label === "New ID Document"
                const isUrl = typeof val === "string" && val.startsWith("http")
                return (
                  <span
                    key={label + val}
                    className="inline-flex items-center gap-1 text-[11px] rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5"
                  >
                    <Hash className="h-2.5 w-2.5 text-slate-400" />
                    <span className="text-slate-400">{label}:</span>
                    {isPhoto && isUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={val}
                        alt={label}
                        className="h-7 w-7 rounded object-cover ml-1"
                      />
                    ) : (
                      <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[160px]">
                        {val}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          ) : (
            <span className="text-xs text-slate-400">No field changes recorded.</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-slate-400 whitespace-nowrap">
          {formatDate(r.createdAt)}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Link href={`/dashboard/members/${r.member.id}`} title="Open member">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
            {r.status === "PENDING" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-emerald-600 hover:bg-emerald-50"
                  disabled={isPending}
                  onClick={() => handleApprove(r.id)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-rose-600 hover:bg-rose-50"
                  disabled={isPending}
                  onClick={() => handleReject(r.id)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    )
  }

  const renderTab = (
    list: ProfileApprovalItem[],
    emptyHint: string,
    value: "pending" | "approved" | "rejected"
  ) => (
    <TabsContent value={value} className="space-y-4">
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Member
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Requested Changes
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Requested
              </TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-16 text-slate-400">
                  <UserCog className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium">Nothing here</p>
                  <p className="text-sm">{emptyHint}</p>
                </TableCell>
              </TableRow>
            ) : (
              list.map(renderRow)
            )}
          </TableBody>
        </Table>
      </Card>
    </TabsContent>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profile Update Approvals
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Review profile &amp; photo changes submitted by members from the portal.
          Approving applies the changes to the member record.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1">
            <UserCog className="h-3.5 w-3.5" />
            Pending
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">
              {pending.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
              {approved.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
              {rejected.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {renderTab(pending, "No pending profile update requests.", "pending")}
        {renderTab(approved, "No approved profile updates yet.", "approved")}
        {renderTab(rejected, "No rejected profile updates.", "rejected")}
      </Tabs>
    </div>
  )
}
