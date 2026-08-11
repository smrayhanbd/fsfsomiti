"use client"

import { useState, useMemo, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { setUserActive, deleteUser } from "@/app/actions/users"
import { formatDate } from "@/lib/accounting"
import { Search, Plus, UserCog, ShieldCheck, Trash2, Power, Eye, Users as UsersIcon } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import StatCard from "@/components/somiti/StatCard"
import StatusBadge from "@/components/somiti/StatusBadge"
import SectionCard from "@/components/somiti/SectionCard"

interface UserRow {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  createdBy: string | null
}

interface Props {
  users: UserRow[]
  canManage: boolean
  currentUserId: string
}

export default function UsersClient({ users, canManage, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("ALL")

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          u.email.toLowerCase().includes(q) ||
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [users, search, roleFilter])

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      superAdmins: users.filter((u) => u.role === "SUPER_ADMIN").length,
    }),
    [users]
  )

  const handleToggleActive = (u: UserRow) => {
    const verb = u.isActive ? "disable" : "enable"
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${u.email}?`)) return
    startTransition(async () => {
      const res = await setUserActive(u.id, !u.isActive)
      if (res.ok) {
        toast.success(`User ${verb}d`)
      } else {
        toast.error("Failed", { description: res.error })
      }
    })
  }

  const handleDelete = (u: UserRow) => {
    if (!confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deleteUser(u.id)
      if (res.ok) toast.success("User deleted")
      else toast.error("Failed", { description: res.error })
    })
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="User Control"
        subtitle="Manage admin & staff users, roles, permissions and login status."
        actions={
          canManage ? (
            <Link href="/dashboard/users/new">
              <Button className="brand-gradient shadow-brand-glow">
                <Plus className="mr-2 h-4 w-4" /> Add User
              </Button>
            </Link>
          ) : undefined
        }
      />

      {!canManage && (
        <div className="card-premium border-warning bg-warning-soft p-4 t-body text-warning">
          You need Super Admin rights to create, edit, or disable users. You can view the list below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Users" value={stats.total.toLocaleString()} icon={UsersIcon} accent="blue" />
        <StatCard label="Active" value={stats.active.toLocaleString()} icon={UserCog} accent="emerald" />
        <StatCard label="Super Admins" value={stats.superAdmins.toLocaleString()} icon={ShieldCheck} accent="violet" />
      </div>

      {/* Toolbar */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
            <Input
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { if (v) setRoleFilter(v) }}>
            <SelectTrigger className="w-40 bg-[var(--control-bg)]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Roles</SelectItem>
              <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
              <TableHead className="t-overline text-muted-ink">User</TableHead>
              <TableHead className="t-overline text-muted-ink">Role</TableHead>
              <TableHead className="t-overline text-muted-ink">Last Login</TableHead>
              <TableHead className="t-overline text-center text-muted-ink">Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="border-[var(--border-base)]">
                <TableCell colSpan={5} className="py-16 text-center t-body text-muted-ink">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full brand-gradient t-subheading font-semibold text-white">
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="t-body font-medium text-primary-ink">
                          {u.name ?? "Unnamed"}
                          {u.id === currentUserId && (
                            <span className="ml-2 t-caption text-brand">(you)</span>
                          )}
                        </p>
                        <p className="t-caption text-muted-ink">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.role === "SUPER_ADMIN" ? (
                      <Badge className="border-brand bg-brand-gradient-soft text-brand">
                        <ShieldCheck className="mr-1 h-3 w-3" /> Super Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline">Admin</Badge>
                    )}
                  </TableCell>
                  <TableCell className="t-caption text-muted-ink">
                    {u.lastLogin ? formatDate(u.lastLogin) : "Never"}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/dashboard/users/${u.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="View / edit">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={isPending || u.id === currentUserId}
                            onClick={() => handleToggleActive(u)}
                            title={u.isActive ? "Disable" : "Enable"}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-debit hover:bg-debit-soft"
                            disabled={isPending || u.id === currentUserId}
                            onClick={() => handleDelete(u)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  )
}
