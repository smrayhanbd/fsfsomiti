"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { addAttachment, deleteAttachment } from "@/app/actions/tasks"
import { toast } from "sonner"
import { Paperclip, Upload, Trash2, FileText } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { TaskRow } from "@/app/actions/tasks"

export default function AttachmentsPanel({ task }: { task: TaskRow }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await addAttachment(task.id, fd)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ""
    if (res.ok) toast.success("Attachment uploaded")
    else toast.error("Upload failed", { description: res.error })
  }

  const remove = async (id: string) => {
    const res = await deleteAttachment(id)
    if (res.ok) toast.success("Attachment removed")
    else toast.error("Failed", { description: res.error })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-indigo-600" />
          Attachments ({task.attachments.length})
        </h3>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="h-4 w-4" /> Upload
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onUpload} accept=".pdf,.doc,.docx,.txt,image/*" />
      </div>
      <div className="space-y-1.5">
        {task.attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm group">
            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
            <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-slate-700 dark:text-slate-200 hover:text-indigo-600">
              {a.fileName}
            </a>
            <span className="text-[11px] text-slate-400">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => remove(a.id)} className="opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </div>
        ))}
        {task.attachments.length === 0 && <p className="text-xs text-slate-400 py-2">No attachments yet.</p>}
      </div>
    </div>
  )
}
