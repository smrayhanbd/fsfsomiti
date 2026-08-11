"use client"

import React, { useState, useMemo, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender,
  type ColumnDef, type SortingState, type Row,
} from "@tanstack/react-table"
import {
  Users, PlusCircle, Eye, MoreHorizontal, Edit, Banknote, CreditCard, BookOpen,
  Printer, Mail, MessageSquare, PauseCircle, Trash2, PlayCircle,
  Search, Filter, Upload, TrendingUp, TrendingDown,
  ArrowUpDown, Shield, Wallet, Phone, RefreshCw, ChevronDown,
  SearchX, CheckCircle2, AlertCircle, UserPlus, Download, ShieldCheck,
  Loader2, ChevronLeft, ChevronRight, X, Check, KeyRound,
} from "lucide-react"

import {
  updateMemberStatus, deleteMember, setMemberKyc,
  bulkUpdateMemberStatus, bulkDeleteMembers,
  resetMemberCredentials,
} from "@/app/actions/member"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import MemberQuickView, { type QuickViewMember } from "@/components/member/MemberQuickView"

import PageHeader from "@/components/somiti/PageHeader"
import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import StatusBadge from "@/components/somiti/StatusBadge"

interface Member {
  id: string
  fullName: string
  memberNo: string
  phone: string
  email: string | null
  gender: "MALE" | "FEMALE" | "OTHER"
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "INACTIVE" | "REJECTED"
  nidNumber: string | null
  kycVerified: boolean
  photoUrl: string | null
  profession: string | null
  nomineesCount?: number
  savings: { amount: number }[]
  createdAt: string
  membershipDate: string
  dueBalance: number
  lateFines: number
}

// ─── Sub-components (token-driven) ───────────────────────────────────
function MemberAvatar({ member }: { member: Member }) {
  if (member.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={member.photoUrl} alt={member.fullName} className="h-10 w-10 rounded-full object-cover ring-2 ring-[var(--border-base)]" />
    )
  }
  const initials = member.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient-soft text-sm font-bold text-brand ring-2 ring-[var(--border-base)]">
      {initials}
    </div>
  )
}

function KycToggleInline({ member, onDone }: { member: Member; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const toggle = () => {
    startTransition(async () => {
      await setMemberKyc(member.id, !member.kycVerified)
      toast.success(`KYC ${member.kycVerified ? "revoked" : "verified"} for ${member.fullName}.`)
      onDone()
    })
  }
  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={member.kycVerified ? "Revoke KYC" : "Verify KYC"}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
        member.kycVerified
          ? "text-success hover:bg-success-soft"
          : "text-warning hover:bg-warning-soft"
      }`}
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (member.kycVerified ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />)}
    </button>
  )
}

function ActionDropdown({ member }: { member: Member }) {
  const [isPending, startTransition] = useTransition()
  const run = (fn: () => Promise<void>) => startTransition(async () => { await fn() })

  const handleSuspend = () => {
    if (confirm(`Suspend ${member.fullName}? They will lose portal access.`)) {
      run(async () => {
        try {
          await updateMemberStatus(member.id, "SUSPENDED")
          toast.success(`${member.fullName} suspended.`)
        } catch (e: unknown) {
          toast.error("Could not suspend", { description: (e as { message?: string })?.message || "Please try again." })
        }
      })
    }
  }
  const handleActivate = () => {
    if (confirm(`Activate ${member.fullName}?`)) {
      run(async () => {
        try {
          await updateMemberStatus(member.id, "ACTIVE")
          toast.success(`${member.fullName} activated.`)
        } catch (e: unknown) {
          toast.error("Could not activate", { description: (e as { message?: string })?.message || "Please try again." })
        }
      })
    }
  }
  const handleDelete = () => {
    if (confirm(`DELETE ${member.fullName}? This action cannot be undone.`)) {
      run(async () => {
        // deleteMember now returns { ok, error } instead of throwing raw
        // errors — surface the real reason (loans / pending transactions /
        // savings balance) so the admin knows what to fix.
        const res = await deleteMember(member.id)
        if (res.ok) {
          toast.success(`${member.fullName} deleted.`, {
            description: res.error || undefined,
          })
        } else {
          toast.error(`Could not delete ${member.fullName}`, {
            description: res.error,
          })
        }
      })
    }
  }
  const handleResetCredentials = () => {
    const ok = confirm(
      `Reset portal login for ${member.fullName}? A new temporary password will be generated and sent via SMS${
        member.email ? " and Email" : ""
      }.`
    )
    if (!ok) return
    run(async () => {
      const res = await resetMemberCredentials(member.id)
      if (res.ok) {
        toast.success(`Credentials sent to ${member.fullName}.`, {
          description: res.message || "Member will receive SMS / Email with new login.",
        })
      } else {
        toast.error(`Could not send credentials`, { description: res.error })
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-lg p-2 text-muted-ink transition-colors outline-none hover:bg-subtle hover:text-primary-ink">
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 w-56">
        <p className="t-overline px-3 py-1.5 text-faint-ink">Member Actions</p>
        <DropdownMenuItem className="p-0">
          <Link href={`/dashboard/members/${member.id}`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Eye className="h-4 w-4" /> View Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="p-0">
          <Link href={`/dashboard/members/${member.id}/edit`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Edit className="h-4 w-4" /> Edit Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="p-0">
          <Link href={`/api/members/${member.id}/print-form`} target="_blank" rel="noopener noreferrer" className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Printer className="h-4 w-4" /> Print Form</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <p className="t-overline px-3 py-1.5 text-faint-ink">Financial</p>
        <DropdownMenuItem className="p-0">
          <Link href="/dashboard/collection-entry" className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Banknote className="h-4 w-4" /> Deposit Entry</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="p-0">
          <Link href="/dashboard/deposits" className="flex w-full cursor-pointer items-center gap-2.5 p-2"><CreditCard className="h-4 w-4" /> Payment Entry</Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="p-0">
          <Link href="/dashboard/member-ledger" className="flex w-full cursor-pointer items-center gap-2.5 p-2"><BookOpen className="h-4 w-4" /> View Ledger</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <p className="t-overline px-3 py-1.5 text-faint-ink">Communication</p>
        {member.email ? (
          <DropdownMenuItem className="p-0"><a href={`mailto:${member.email}`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Mail className="h-4 w-4" /> Send Email</a></DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled><Mail className="mr-2.5 h-4 w-4" /> No Email</DropdownMenuItem>
        )}
        {member.phone ? (
          <DropdownMenuItem className="p-0"><a href={`sms:${member.phone}`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><MessageSquare className="h-4 w-4" /> Send SMS</a></DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled><MessageSquare className="mr-2.5 h-4 w-4" /> No Phone</DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <p className="t-overline px-3 py-1.5 text-faint-ink">Portal Access</p>
        <DropdownMenuItem
          onClick={handleResetCredentials}
          disabled={isPending || member.status !== "ACTIVE"}
          className="cursor-pointer text-brand focus:text-brand"
        >
          <KeyRound className="mr-2.5 h-4 w-4" /> {isPending ? "Sending..." : "Reset & Send Credentials"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {member.status !== "SUSPENDED" ? (
          <DropdownMenuItem onClick={handleSuspend} disabled={isPending} className="cursor-pointer text-warning focus:text-warning">
            <PauseCircle className="mr-2.5 h-4 w-4" /> {isPending ? "Suspending..." : "Suspend Account"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleActivate} disabled={isPending} className="cursor-pointer text-success focus:text-success">
            <PlayCircle className="mr-2.5 h-4 w-4" /> {isPending ? "Activating..." : "Activate Account"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleDelete} disabled={isPending} className="cursor-pointer text-debit focus:text-debit">
          <Trash2 className="mr-2.5 h-4 w-4" /> {isPending ? "Deleting..." : "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-subtle">
        <SearchX className="h-8 w-8 text-faint-ink" />
      </div>
      <h3 className="t-h3 mb-1 text-primary-ink">No members found</h3>
      <p className="t-body mb-6 max-w-sm text-muted-ink">Try adjusting your search or filters, or add a new member to get started.</p>
      <Link href="/dashboard/members/add">
        <button className="brand-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-brand-glow transition-transform hover:-translate-y-0.5">
          <PlusCircle className="h-4 w-4" /> Add New Member
        </button>
      </Link>
    </div>
  )
}

// ─── CSV export (client-side, no new dependency) ─────────────────────
function exportMembersCsv(members: Member[]) {
  const headers = ["Member No", "Full Name", "Phone", "Email", "Gender", "Status", "KYC", "Savings", "Due Balance", "Late Fines", "Joined", "Profession"]
  const rows = members.map(m => [
    m.memberNo, m.fullName, m.phone, m.email || "", m.gender, m.status,
    m.kycVerified ? "Verified" : "Pending",
    String(m.savings.reduce((a, s) => a + s.amount, 0)),
    String(m.dueBalance), String(m.lateFines),
    new Date(m.membershipDate).toLocaleDateString(),
    m.profession || "",
  ])
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `members-${new Date().toISOString().split("T")[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`Exported ${members.length} members to CSV.`)
}

// ─── Column definitions ──────────────────────────────────────────────
function useMemberColumns(
  onQuickView: (id: string) => void,
  onKycDone: () => void,
  selectedRows: Set<string>,
  toggleRow: (id: string) => void,
): ColumnDef<Member>[] {
  return useMemo(() => [
    {
      id: "select",
      header: () => null, // selection header handled in the toolbar
      cell: ({ row }) => {
        const isSelected = selectedRows.has(row.original.id)
        return (
          <button
            onClick={() => toggleRow(row.original.id)}
            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${isSelected ? "border-brand bg-brand" : "border-[var(--border-strong)] hover:border-brand"}`}
            aria-label="Select row"
          >
            {isSelected && <Check className="h-3 w-3 text-white" />}
          </button>
        )
      },
      size: 44,
      enableSorting: false,
    },
    {
      accessorKey: "fullName",
      header: "Member Info",
      cell: ({ row }) => {
        const m = row.original
        return (
          <div className="flex items-center gap-3">
            <MemberAvatar member={m} />
            <div>
              <p className="t-subheading text-primary-ink">{m.fullName}</p>
              <p className="t-num t-caption mt-0.5 text-brand">{m.memberNo}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "phone",
      header: "Contact",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="t-body flex items-center gap-1.5 text-secondary-ink"><Phone className="h-3.5 w-3.5 text-faint-ink" />{row.original.phone}</span>
          {row.original.email && <span className="t-caption flex items-center gap-1.5 text-muted-ink"><Mail className="h-3.5 w-3.5" />{row.original.email}</span>}
        </div>
      ),
    },
    {
      accessorKey: "membershipDate",
      header: "Join Date",
      cell: ({ row }) => (
        <span className="t-body whitespace-nowrap text-muted-ink">
          {new Date(row.original.membershipDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "savings",
      accessorFn: (m) => m.savings.reduce((a, s) => a + s.amount, 0),
      header: "Finances",
      cell: ({ row }) => {
        const total = row.original.savings.reduce((a, s) => a + s.amount, 0)
        return <Money amount={total} className="flex items-center gap-1.5 font-bold text-success" />
      },
    },
    {
      accessorKey: "dueBalance",
      header: "Due Balance",
      cell: ({ row }) => {
        const m = row.original
        return m.dueBalance > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="flex w-fit items-center gap-1.5 rounded-md bg-debit-soft px-2 py-1 text-debit">
              <AlertCircle className="h-3.5 w-3.5" /> <Money amount={m.dueBalance} className="font-bold" />
            </span>
            {m.lateFines > 0 && (
              <span className="flex w-fit items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-warning">
                <AlertCircle className="h-3 w-3" /> Fine: <Money amount={m.lateFines} className="font-medium" />
              </span>
            )}
          </div>
        ) : (
          <span className="flex w-fit items-center gap-1.5 rounded-md bg-success-soft px-2 py-1 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> <Money amount={0} className="font-medium" /> (Clear)
          </span>
        )
      },
    },
    {
      accessorKey: "kycVerified",
      header: "KYC",
      cell: ({ row }) => (
        <div className="flex items-center justify-start">
          <KycToggleInline member={row.original} onDone={onKycDone} />
          <span className={`ml-1 text-[10px] font-semibold ${row.original.kycVerified ? "text-success" : "text-warning"}`}>
            {row.original.kycVerified ? "Verified" : "Pending"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onQuickView(row.original.id)}
            title="Quick view"
            className="rounded-lg p-2 text-faint-ink transition-all hover:bg-brand-gradient-soft hover:text-brand"
          >
            <Eye className="h-4 w-4" />
          </button>
          <ActionDropdown member={row.original} />
        </div>
      ),
      enableSorting: false,
    },
  ], [onQuickView, onKycDone, selectedRows, toggleRow])
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function MemberListClient({ members }: { members: Member[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  // Initial sort by Join Date (membershipDate) — there is no `createdAt` column
  // in the table, so referencing it made @tanstack/react-table throw
  // "[Table] Column with id 'createdAt' does not exist".
  const [sorting, setSorting] = useState<SortingState>([{ id: "membershipDate", desc: true }])
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [quickViewId, setQuickViewId] = useState<string | null>(null)

  const toggleRow = React.useCallback((id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const onKycDone = React.useCallback(() => {}, [])

  const columns = useMemberColumns(setQuickViewId, onKycDone, selectedRows, toggleRow)

  // Pre-filter by search + status + type (TanStack handles the rest)
  const filteredData = useMemo(() => {
    let result = [...members]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m =>
        m.fullName.toLowerCase().includes(q) ||
        m.memberNo.toLowerCase().includes(q) ||
        m.phone.includes(q) ||
        (m.email && m.email.toLowerCase().includes(q))
      )
    }
    if (statusFilter !== "all") result = result.filter(m => m.status === statusFilter)
    if (typeFilter === "savings") result = result.filter(m => m.savings.length > 0)
    else if (typeFilter === "kyc") result = result.filter(m => !m.kycVerified)
    else if (typeFilter === "due") result = result.filter(m => m.dueBalance > 0)
    return result
  }, [members, searchQuery, statusFilter, typeFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  })

  const quickViewMember = useMemo<QuickViewMember | null>(() => {
    if (!quickViewId) return null
    const m = members.find(x => x.id === quickViewId)
    if (!m) return null
    return {
      id: m.id, fullName: m.fullName, memberNo: m.memberNo,
      phone: m.phone, email: m.email, gender: m.gender,
      status: m.status, kycVerified: m.kycVerified, photoUrl: m.photoUrl,
      profession: m.profession, membershipDate: m.membershipDate,
      createdAt: m.createdAt, dueBalance: m.dueBalance, lateFines: m.lateFines,
      nomineesCount: m.nomineesCount,
      savings: m.savings.map(s => ({ amount: s.amount })),
    }
  }, [quickViewId, members])

  // ─── Stats ───
  const stats = useMemo(() => {
    const total = members.length
    const active = members.filter(m => m.status === "ACTIVE").length
    const pending = members.filter(m => m.status === "PENDING").length
    const newThisMonth = members.filter(m => {
      const d = new Date(m.createdAt); const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    return { total, active, pending, newThisMonth }
  }, [members])

  // ─── Bulk ops ───
  const bulkActivate = async () => {
    const ids = Array.from(selectedRows)
    if (!confirm(`Activate ${ids.length} member(s)?`)) return
    await bulkUpdateMemberStatus(ids, "ACTIVE")
    toast.success(`${ids.length} member(s) activated.`); setSelectedRows(new Set())
  }
  const bulkSuspend = async () => {
    const ids = Array.from(selectedRows)
    if (!confirm(`Suspend ${ids.length} member(s)?`)) return
    await bulkUpdateMemberStatus(ids, "SUSPENDED")
    toast.success(`${ids.length} member(s) suspended.`); setSelectedRows(new Set())
  }
  const bulkRemove = async () => {
    const ids = Array.from(selectedRows)
    if (!confirm(`DELETE ${ids.length} member(s)? This cannot be undone.`)) return
    // bulkDeleteMembers now returns per-member errors so we can show
    // which rows the admin still has to fix (loans / pending txns / balance).
    const res = await bulkDeleteMembers(ids)
    if (res.ok) {
      toast.success(`${ids.length} member(s) deleted.`)
      setSelectedRows(new Set())
    } else {
      const failedIds = Object.keys(res.errors)
      const failedNames = members
        .filter((m) => failedIds.includes(m.id))
        .map((m) => `${m.fullName}: ${res.errors[m.id]}`)
        .join("\n")
      toast.error(`Could not delete ${failedIds.length} of ${ids.length} member(s)`, {
        description: failedNames,
      })
      // Keep only the failed ones selected so the admin can see which rows to fix
      setSelectedRows(new Set(failedIds))
    }
  }
  const bulkExport = () => {
    const selected = members.filter(m => selectedRows.has(m.id))
    exportMembersCsv(selected)
  }

  const toggleSelectAll = () => {
    const pageIds = table.getRowModel().rows.map(r => r.original.id)
    const allSelected = pageIds.every(id => selectedRows.has(id))
    setSelectedRows(prev => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }
  const allPageSelected = table.getRowModel().rows.length > 0 &&
    table.getRowModel().rows.every(r => selectedRows.has(r.original.id))

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || searchQuery

  return (
    <div className="space-y-8">
      <PageHeader
        title="Members"
        subtitle="Manage your foundation members, KYC, and finances."
        actions={
          <>
            <button
              onClick={() => exportMembersCsv(filteredData)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-base)] px-4 py-2.5 t-body font-medium text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <Link href="/dashboard/members/add">
              <Button className="brand-gradient shadow-brand-glow">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Member
              </Button>
            </Link>
          </>
        }
      />

      {/* ─── Stats grid ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="totalMembers" value={stats.total.toLocaleString()} icon={Users} accent="blue" trend={{ value: 12, positive: true }} />
        <StatCard label="active" value={stats.active.toLocaleString()} icon={CheckCircle2} accent="emerald" trend={{ value: 8, positive: true }} />
        <StatCard label="pending" value={stats.pending.toLocaleString()} icon={AlertCircle} accent="amber" />
        <StatCard label="newThisMonth" value={stats.newThisMonth.toLocaleString()} icon={UserPlus} accent="violet" trend={{ value: 25, positive: true }} />
      </div>

      {/* ─── Table container ─── */}
      <div className="card-premium overflow-hidden">
        {/* Search & primary actions */}
        <div className="border-b border-[var(--border-base)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Search className={`h-5 w-5 transition-colors ${isSearchFocused ? "text-brand" : "text-faint-ink"}`} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search members by name, ID, or phone…"
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--control-bg)] py-2.5 pl-11 pr-4 t-body text-primary-ink placeholder:text-muted-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--brand-primary)_25%,transparent)]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                  <X className="h-4 w-4 text-faint-ink hover:text-secondary-ink" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-base)] px-3 py-2.5 t-body font-medium text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink">
                <Filter className="h-4 w-4" /> Filters <ChevronDown className="h-3.5 w-3.5 text-faint-ink" />
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl border border-[var(--border-base)] p-2.5 text-muted-ink transition-colors hover:bg-subtle hover:text-primary-ink"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-base)] bg-subtle/40 px-4 py-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="cursor-pointer rounded-lg border border-[var(--border-base)] bg-surface px-3 py-1.5 t-body text-secondary-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--brand-primary)_25%,transparent)]"
          >
            <option value="all">Status: All</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="cursor-pointer rounded-lg border border-[var(--border-base)] bg-surface px-3 py-1.5 t-body text-secondary-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--brand-primary)_25%,transparent)]"
          >
            <option value="all">Type: All</option>
            <option value="savings">Has Savings</option>
            <option value="due">Has Due Balance</option>
            <option value="kyc">Pending KYC</option>
          </select>

          {hasActiveFilters && (
            <div className="ml-2 flex items-center gap-1.5">
              <span className="t-caption text-faint-ink">Active:</span>
              {statusFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-gradient-soft px-2 py-0.5 t-caption font-medium text-brand">
                  Status: {statusFilter}
                  <button onClick={() => setStatusFilter("all")} className="hover:text-primary-ink"><X className="h-3 w-3" /></button>
                </span>
              )}
              {typeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-brand-gradient-soft px-2 py-0.5 t-caption font-medium text-brand">
                  Type: {typeFilter}
                  <button onClick={() => setTypeFilter("all")} className="hover:text-primary-ink"><X className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSearchQuery("") }} className="t-caption text-muted-ink underline hover:text-primary-ink">Clear all</button>
            </div>
          )}

          <div className="flex-1" />
          <div className="hidden items-center gap-1 md:flex">
            <button className="rounded-lg p-2 text-faint-ink transition-colors hover:bg-subtle hover:text-secondary-ink" title="Print"><Printer className="h-4 w-4" /></button>
            <button className="rounded-lg p-2 text-faint-ink transition-colors hover:bg-subtle hover:text-secondary-ink" title="Upload"><Upload className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedRows.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-base)] bg-brand-gradient-soft px-4 py-2.5">
            <div className="flex items-center gap-2 t-body font-semibold text-brand">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs text-white">{selectedRows.size}</span>
              selected of {filteredData.length}
            </div>
            <div className="flex-1" />
            <BulkBtn onClick={bulkActivate} icon={<PlayCircle className="h-3.5 w-3.5" />} label="Activate" tone="success" />
            <BulkBtn onClick={bulkSuspend} icon={<PauseCircle className="h-3.5 w-3.5" />} label="Suspend" tone="warning" />
            <BulkBtn onClick={bulkRemove} icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" tone="debit" />
            <BulkBtn onClick={bulkExport} icon={<Download className="h-3.5 w-3.5" />} label="Export CSV" tone="brand" />
            <button onClick={() => setSelectedRows(new Set())} className="rounded-lg p-1.5 text-faint-ink hover:bg-surface/50 hover:text-secondary-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-base)] bg-subtle/40">
                <th className="w-12 px-4 py-3.5">
                  <button
                    onClick={toggleSelectAll}
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${allPageSelected ? "border-brand bg-brand" : "border-[var(--border-strong)] hover:border-brand"}`}
                    aria-label="Select all"
                  >
                    {allPageSelected && <Check className="h-3 w-3 text-white" />}
                  </button>
                </th>
                {table.getHeaderGroups()[0].headers.slice(1).map(header => {
                  const canSort = header.column.getCanSort()
                  const isSorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={`px-4 py-3.5 ${header.id === "actions" ? "text-right" : "text-left"}`}
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    >
                      <button
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        disabled={!canSort}
                        className={`inline-flex items-center gap-1.5 t-overline text-muted-ink transition-colors hover:text-primary-ink ${canSort ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && <ArrowUpDown className={`h-3.5 w-3.5 ${isSorted ? "text-brand" : "opacity-0"}`} />}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length}><EmptyState /></td></tr>
              ) : (
                table.getRowModel().rows.map((row: Row<Member>) => {
                  const isSelected = selectedRows.has(row.original.id)
                  return (
                    <tr
                      key={row.original.id}
                      className={`border-b border-[var(--border-base)] transition-colors ${isSelected ? "bg-brand-gradient-soft" : "hover:bg-subtle"}`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-4 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[var(--border-base)] bg-subtle/40 px-6 py-4">
          <p className="t-body text-muted-ink">
            Showing <span className="t-num font-bold text-primary-ink">
              {filteredData.length > 0 ? (table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1) : 0}
              –{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredData.length)}
            </span> of <span className="t-num font-bold text-primary-ink">{filteredData.length}</span> Members
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg border border-[var(--border-base)] p-2 text-muted-ink transition-colors hover:bg-subtle hover:text-primary-ink disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: table.getPageCount() }, (_, i) => i).slice(0, 7).map(page => (
              <button
                key={page}
                onClick={() => table.setPageIndex(page)}
                className={`h-8 w-8 rounded-lg t-body font-medium transition-colors ${table.getState().pagination.pageIndex === page ? "brand-gradient text-white shadow-brand-glow" : "text-secondary-ink hover:bg-subtle hover:text-primary-ink"}`}
              >
                {page + 1}
              </button>
            ))}
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-lg border border-[var(--border-base)] p-2 text-muted-ink transition-colors hover:bg-subtle hover:text-primary-ink disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick view drawer */}
      <MemberQuickView
        member={quickViewMember}
        open={!!quickViewMember}
        onOpenChange={(o) => { if (!o) setQuickViewId(null) }}
      />
    </div>
  )
}

// Small button used inside the bulk bar — extracted to keep the main render readable.
function BulkBtn({ onClick, icon, label, tone }: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  tone: "success" | "warning" | "debit" | "brand"
}) {
  const tones: Record<string, string> = {
    success: "text-success bg-success-soft hover:opacity-80",
    warning: "text-warning bg-warning-soft hover:opacity-80",
    debit: "text-debit bg-debit-soft hover:opacity-80",
    brand: "text-brand border border-[var(--border-base)] bg-surface hover:bg-subtle",
  }
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 t-caption font-semibold transition-opacity ${tones[tone]}`}>
      {icon} {label}
    </button>
  )
}
