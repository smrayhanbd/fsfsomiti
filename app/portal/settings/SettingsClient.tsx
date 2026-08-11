"use client"

import { useState } from "react"
import { changePassword, submitClosingRequest } from "@/app/actions/portal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Lock, AlertTriangle, ShieldCheck, Eye, EyeOff } from "lucide-react"
import { isNextRedirect } from "@/lib/nextRedirect"

export default function SettingsClient({ memberId, hasPendingClose }: { memberId: string, hasPendingClose: boolean }) {
  const [pwdLoading, setPwdLoading] = useState(false)
  const [closeLoading, setCloseLoading] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Capture the form element before any `await`. React nulls out
    // `e.currentTarget` once event propagation finishes (i.e. before an
    // awaited promise resolves), so referencing it after the await throws
    // a TypeError that previously surfaced as a spurious error toast.
    const form = e.currentTarget
    const formData = new FormData(form)
    const newPwd = formData.get("newPassword") as string
    const confirmPwd = formData.get("confirmPassword") as string

    if (newPwd !== confirmPwd) {
      toast.error("Passwords don't match", { description: "New password and confirmation must match." })
      return
    }
    if (newPwd.length < 6) {
      toast.error("Password too short", { description: "Password must be at least 6 characters." })
      return
    }

    setPwdLoading(true)
    try {
      const result = await changePassword(memberId, formData)
      if (result?.error) {
        toast.error("Error", { description: result.error })
      } else if (result?.success) {
        toast.success("Success", { description: result.success })
        form.reset()
      }
    } catch {
      toast.error("Error", { description: "Something went wrong." })
    }
    setPwdLoading(false)
  }

  const handleClosingSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!confirm("Are you absolutely sure you want to request account closure? This action cannot be undone.")) return

    setCloseLoading(true)
    const form = e.currentTarget
    const formData = new FormData(form)

    try {
      const result = await submitClosingRequest(memberId, formData)
      if (result?.error) {
        toast.error("Error", { description: result.error })
        setCloseLoading(false)
      }
    } catch (err: unknown) {
      // The action ends with redirect(), which throws NEXT_REDIRECT — that is
      // the success path (the page navigates to /portal/settings), not an
      // error. Re-throw it so Next handles the navigation instead of showing
      // a spurious "Something went wrong" toast.
      if (isNextRedirect(err)) throw err
      toast.error("Error", { description: "Something went wrong." })
      setCloseLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your account security and preferences.
        </p>
      </div>

      {/* Security Section */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <Lock className="h-4 w-4 text-indigo-500" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  required
                  placeholder="Enter your current password"
                  className="pr-10 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  name="newPassword"
                  type={showNew ? "text" : "password"}
                  required
                  placeholder="At least 6 characters"
                  className="pr-10 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  required
                  placeholder="Re-enter new password"
                  className="pr-10 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={pwdLoading} className="bg-indigo-600 hover:bg-indigo-700">
              {pwdLoading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-rose-50/40 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/50 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-rose-100/50 dark:bg-rose-950/20 border-b border-rose-200 dark:border-rose-900/50 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {hasPendingClose ? (
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900 rounded-xl">
              <ShieldCheck className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Account Closure Request Pending</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Your request to close this account is currently being reviewed by management. Please wait for their response.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleClosingSubmit} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-rose-700 dark:text-rose-400">Reason for Closing Account</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  required
                  placeholder="Please explain why you want to close your account..."
                  className="bg-white dark:bg-slate-950 border-rose-200 dark:border-rose-900/50 focus-visible:ring-rose-500 min-h-[100px]"
                />
              </div>
              <Button type="submit" variant="destructive" disabled={closeLoading}>
                {closeLoading ? "Submitting..." : "Submit Closing Request"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
