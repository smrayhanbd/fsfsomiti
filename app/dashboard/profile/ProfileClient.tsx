"use client"

import { useTransition, useState } from "react"
import { updateProfile, changeOwnPassword } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { User, Mail, Phone, ShieldCheck, Save, KeyRound, Clock } from "lucide-react"
import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"

interface InitialData {
  name: string
  email: string
  phone: string
  role: string
  lastLogin: string | null
}

/** Human label for the routing role stored on User.role. */
function roleLabel(role: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin"
    case "ADMIN":
      return "Admin"
    default:
      return role
  }
}

export default function ProfileClient({ initial }: { initial: InitialData }) {
  const [isPending, startTransition] = useTransition()
  const [pwPending, startPwTransition] = useTransition()
  const [form, setForm] = useState({ name: initial.name, phone: initial.phone })
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" })

  const setField =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const setPwField =
    (key: keyof typeof pw) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setPw((prev) => ({ ...prev, [key]: e.target.value }))

  const handleProfileSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData()
    fd.append("name", form.name)
    fd.append("phone", form.phone)
    startTransition(async () => {
      const res = await updateProfile(fd)
      if (res.ok) toast.success("Profile saved")
      else toast.error("Could not save", { description: res.error })
    })
  }

  const handlePasswordSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pw.newPassword !== pw.confirm) {
      toast.error("Passwords do not match", { description: "New password and confirmation differ." })
      return
    }
    const fd = new FormData()
    fd.append("currentPassword", pw.currentPassword)
    fd.append("newPassword", pw.newPassword)
    startPwTransition(async () => {
      const res = await changeOwnPassword(fd)
      if (res.ok) {
        toast.success("Password updated")
        setPw({ currentPassword: "", newPassword: "", confirm: "" })
      } else {
        toast.error("Could not update password", { description: res.error })
      }
    })
  }

  const fieldCls = "bg-[var(--control-bg)]"
  const lastLogin = initial.lastLogin ? new Date(initial.lastLogin).toLocaleString() : "—"

  return (
    <div className="space-y-8">
      <PageHeader
        title="My Profile"
        subtitle="Manage your account details and password."
      />

      {/* Read-only account summary */}
      <SectionCard title="Account" icon={<User />} accent="violet">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <p className="t-overline text-muted-ink">Email</p>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-ink">
              <Mail className="h-4 w-4 text-muted-ink" />
              <span className="truncate">{initial.email}</span>
            </div>
            <p className="t-caption text-muted-ink">Email is managed by a Super Admin.</p>
          </div>
          <div className="space-y-1.5">
            <p className="t-overline text-muted-ink">Role</p>
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-muted-ink" />
              <Badge variant={initial.role === "SUPER_ADMIN" ? "default" : "secondary"}>
                {roleLabel(initial.role)}
              </Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="t-overline text-muted-ink">Last login</p>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-ink">
              <Clock className="h-4 w-4 text-muted-ink" />
              <span>{lastLogin}</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Editable details */}
      <form onSubmit={handleProfileSave} className="space-y-8">
        <SectionCard title="Personal details" icon={<User />} action={
          <Button type="submit" disabled={isPending} className="brand-gradient shadow-lift">
            <Save className="mr-2 h-4 w-4" /> {isPending ? "Saving…" : "Save"}
          </Button>
        }>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={form.name} onChange={setField("name")} placeholder="Your name" className={fieldCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
                <Input id="phone" value={form.phone} onChange={setField("phone")} placeholder="+8801…" className={`${fieldCls} pl-9`} />
              </div>
            </div>
          </div>
        </SectionCard>
      </form>

      {/* Change password */}
      <form onSubmit={handlePasswordSave} className="space-y-8">
        <SectionCard title="Change password" icon={<KeyRound />} accent="amber" action={
          <Button type="submit" disabled={pwPending} className="brand-gradient shadow-lift">
            <KeyRound className="mr-2 h-4 w-4" /> {pwPending ? "Updating…" : "Update password"}
          </Button>
        }>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" type="password" value={pw.currentPassword} onChange={setPwField("currentPassword")} required className={fieldCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" value={pw.newPassword} onChange={setPwField("newPassword")} required minLength={6} className={fieldCls} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" value={pw.confirm} onChange={setPwField("confirm")} required className={fieldCls} />
            </div>
          </div>
          <p className="t-caption mt-4 text-muted-ink">Minimum 6 characters. You&apos;ll stay signed in on this device after changing it.</p>
        </SectionCard>
      </form>
    </div>
  )
}
