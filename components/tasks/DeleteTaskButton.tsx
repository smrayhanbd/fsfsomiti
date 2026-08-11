"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { deleteTask } from "@/app/actions/tasks"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

export function DeleteTaskButton({ taskId, title, canDelete }: { taskId: string; title: string; canDelete: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (!canDelete) return null

  const onClick = async () => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setBusy(true)
    const res = await deleteTask(taskId)
    setBusy(false)
    if (res.ok) {
      toast.success("Task deleted")
      router.push("/dashboard/tasks")
      router.refresh()
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={busy}>
      <Trash2 className="h-4 w-4" /> {busy ? "Deleting..." : "Delete"}
    </Button>
  )
}
