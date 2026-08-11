"use client"

import { useState } from "react"
import { submitProfileUpdateRequest } from "@/app/actions/portal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Pencil } from "lucide-react"

/** Subset of the Member model edited in the profile-update dialog. */
interface EditableMember {
  id: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  fatherName: string | null
  motherName: string | null
  spouseName: string | null
  profession: string | null
}

export default function ProfileEditDialog({ member }: { member: EditableMember }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    
    try {
      const result = await submitProfileUpdateRequest(member.id, formData)
      if (result?.error) {
        toast.error("Error", { description: result.error })
      } else if (result?.success) {
        toast.success("Success", { description: result.success })
        setOpen(false)
      }
    } catch (err) {
      toast.error("Error", { description: "Something went wrong." })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-[var(--border-base)] bg-[var(--control-bg)] text-secondary-ink hover:border-brand hover:text-primary-ink px-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2">
        <Pencil className="h-3.5 w-3.5" /> Edit Info
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-white dark:bg-slate-950 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Request Profile Update</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">Note: Changes will not take effect immediately. They will be sent to the Admin for approval.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input name="firstName" defaultValue={member.firstName} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input name="lastName" defaultValue={member.lastName} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input name="phone" defaultValue={member.phone} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input name="email" defaultValue={member.email || ""} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Father&apos;s Name</Label>
              <Input name="fatherName" defaultValue={member.fatherName || ""} />
            </div>
            <div className="space-y-2">
              <Label>Mother&apos;s Name</Label>
              <Input name="motherName" defaultValue={member.motherName || ""} />
            </div>
          </div>
          
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
            {loading ? "Submitting..." : "Submit Update Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}