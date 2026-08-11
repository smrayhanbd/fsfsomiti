"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  updateUser,
  setUserActive,
  resetUserPassword,
  grantPermission,
  revokePermission,
  setUserRole,
} from "@/app/actions/users"
import { PERMISSION_GROUPS } from "@/lib/permissions"
import { formatDate } from "@/lib/accounting"
import {
  ArrowLeft,
  Save,
  KeyRound,
  ShieldCheck,
  Power,
  Lock,
} from "lucide-react"
import UserPermissionsCard from "./UserPermissionsCard"

interface AssignedRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  assignedAt: string
}

interface UserOverride {
  id: string
  effect: "ALLOW" | "DENY"
  reason: string | null
  permission: { id: string; menuGroup: string; page: string; tab: string; action: string }
}

interface UserData {
  id: string
  email: string
  name: string | null
  phone: string | null
  role: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
  createdBy: string | null
  permissions: string[]
  // New RBAC data for the Permissions & Roles card.
  assignedRoles: AssignedRole[]
  overrides: UserOverride[]
  effectiveKeys: string[]
}

interface SelectableRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
}

interface Props {
  user: UserData
  allRoles: SelectableRole[]
  currentRoleId: string | null
  canManage: boolean
  currentUserId: string
}

// Human-readable labels for each permission key.
const PERM_LABELS: Record<string, string> = {
  MEETING_ATTENDANCE_MARK: "Mark Attendance",
  MEETING_MINUTES_UPLOAD: "Upload Minutes",
  TRANSACTION_CREATE: "Create Transactions",
  TRANSACTION_SUBMIT: "Submit for Approval",
  TRANSACTION_APPROVE: "Approve Transactions",
  TRANSACTION_REVERSE: "Reverse Transactions",
  USER_MANAGE: "Manage Users",
}

export default function UserEditClient({ user, allRoles, currentRoleId, canManage, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(user.name ?? "")
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [roleId, setRoleId] = useState<string>(currentRoleId ?? "")
  const [granted, setGranted] = useState<Set<string>>(new Set(user.permissions))
  const [pwOpen, setPwOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")

  const isSelf = user.id === currentUserId
  const isSuperUser = user.role === "SUPER_ADMIN"

  const handleSaveProfile = () => {
    startTransition(async () => {
      // 1. Update profile fields (name/email/phone) via the legacy action.
      //    Derive the routing role value from the selected RBAC role so the
      //    legacy User.role stays consistent with auth routing.
      const selectedRole = allRoles.find((r) => r.id === roleId)
      const routingRole = selectedRole?.isSuperAdmin ? "SUPER_ADMIN" : "ADMIN"
      const formData = new FormData()
      formData.set("name", name)
      formData.set("email", email)
      formData.set("phone", phone)
      formData.set("role", routingRole)
      const res = await updateUser(user.id, formData)
      if (!res.ok) { toast.error("Failed", { description: res.error }); return }

      // 2. Assign the selected RBAC role (replaces any prior functional role
      //    and syncs User.role) if it changed.
      if (roleId && roleId !== currentRoleId) {
        const roleRes = await setUserRole(user.id, roleId)
        if (!roleRes.ok) {
          toast.error("Profile saved, but role change failed", { description: roleRes.error })
          return
        }
      }
      toast.success("Profile updated")
      router.refresh()
    })
  }

  const handleTogglePerm = (key: string, on: boolean) => {
    setGranted((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
    startTransition(async () => {
      const res = on
        ? await grantPermission(user.id, key as Parameters<typeof grantPermission>[1])
        : await revokePermission(user.id, key as Parameters<typeof revokePermission>[1])
      if (res.ok) toast.success(on ? "Permission granted" : "Permission revoked")
      else {
        toast.error("Failed", { description: res.error })
        // revert local state on failure
        setGranted((prev) => {
          const next = new Set(prev)
          if (on) next.delete(key)
          else next.add(key)
          return next
        })
      }
    })
  }

  const handleToggleActive = () => {
    if (!confirm(`${user.isActive ? "Disable" : "Enable"} ${user.email}?`)) return
    startTransition(async () => {
      const res = await setUserActive(user.id, !user.isActive)
      if (res.ok) {
        toast.success(`User ${user.isActive ? "disabled" : "enabled"}`)
        router.refresh()
      } else toast.error("Failed", { description: res.error })
    })
  }

  const handleResetPassword = () => {
    if (newPassword.length < 6) return toast.error("Password too short")
    startTransition(async () => {
      const res = await resetUserPassword(user.id, newPassword)
      if (res.ok) {
        toast.success("Password reset")
        setPwOpen(false)
        setNewPassword("")
      } else toast.error("Failed", { description: res.error })
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/dashboard/users"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to users
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {user.name ?? user.email}
          </h1>
          {isSuperUser && (
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400">
              <ShieldCheck className="h-3 w-3 mr-1" /> Super Admin
            </Badge>
          )}
          {!user.isActive && (
            <Badge variant="outline" className="text-slate-500">
              <Lock className="h-3 w-3 mr-1" /> Disabled
            </Badge>
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{user.email}</p>
      </div>

      {/* Profile */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!canManage}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canManage}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={(v) => { if (v) setRoleId(v) }} disabled={!canManage}>
              <SelectTrigger className="bg-white dark:bg-slate-950">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}{r.isSuperAdmin ? " (full access)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const sel = allRoles.find((r) => r.id === roleId)
              return sel?.description ? (
                <p className="text-[11px] text-slate-400">{sel.description}</p>
              ) : null
            })()}
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-4 text-xs text-slate-500">
            <div>
              Created: {formatDate(user.createdAt)}
              {user.createdBy ? ` by ${user.createdBy}` : ""}
            </div>
            <div>Last login: {user.lastLogin ? formatDate(user.lastLogin) : "Never"}</div>
          </div>
        </CardContent>
      </Card>

      {/* Permission Matrix */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSuperUser ? (
            <p className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
              <ShieldCheck className="inline h-4 w-4 mr-1 text-indigo-500" />
              Super Admin has no permission restrictions.
            </p>
          ) : (
            PERMISSION_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">
                  {g.group}
                </p>
                <div className="space-y-2">
                  {g.keys.map((k) => (
                    <div
                      key={k}
                      className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {PERM_LABELS[k] ?? k}
                      </span>
                      <Switch
                        checked={granted.has(k)}
                        onCheckedChange={(v) => handleTogglePerm(k, v as boolean)}
                        disabled={!canManage || isPending}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Roles, Overrides & Effective Preview (new RBAC system) */}
      <UserPermissionsCard
        userId={user.id}
        assignedRoles={user.assignedRoles}
        overrides={user.overrides}
        effectiveKeys={user.effectiveKeys}
        allRoles={allRoles}
        canManage={canManage}
      />

      {canManage && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleToggleActive} disabled={isPending || isSelf}>
            <Power className="h-4 w-4 mr-2" />
            {user.isActive ? "Disable User" : "Enable User"}
          </Button>
          <Button variant="outline" onClick={() => setPwOpen(true)} disabled={isPending}>
            <KeyRound className="h-4 w-4 mr-2" /> Reset Password
          </Button>
          <Button onClick={handleSaveProfile} disabled={isPending}>
            <Save className="h-4 w-4 mr-2" /> Save Changes
          </Button>
        </div>
      )}

      {/* Reset password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {user.email}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            The user will need to use this new password on next sign-in.
          </p>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={isPending}>
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
