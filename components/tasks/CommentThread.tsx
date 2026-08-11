"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { addComment, deleteComment } from "@/app/actions/tasks"
import { toast } from "sonner"
import { MessageSquare, Send, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { TaskRow } from "@/app/actions/tasks"

export default function CommentThread({ task }: { task: TaskRow }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!body.trim()) return
    setBusy(true)
    const res = await addComment(task.id, body.trim())
    setBusy(false)
    if (res.ok) {
      setBody("")
      toast.success("Comment added")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const remove = async (id: string) => {
    const res = await deleteComment(id)
    if (res.ok) toast.success("Comment removed")
    else toast.error("Failed", { description: res.error })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-indigo-600" />
        Comments ({task.comments.length})
      </h3>
      <div className="space-y-3 mb-4 max-h-[360px] overflow-y-auto">
        {task.comments.map((c) => {
          const author = c.authorUser?.name ?? c.authorUser?.email ?? c.authorMember?.fullName ?? "Unknown"
          const initials = author.slice(0, 2).toUpperCase()
          return (
            <div key={c.id} className="flex gap-2.5 group">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-indigo-500/10 text-indigo-600">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{author}</span>
                  <span className="text-[11px] text-slate-400">
                    {formatDistanceToNow(new Date(c.createdAt as unknown as string), { addSuffix: true })}
                  </span>
                  <Button variant="ghost" size="icon-xs" onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 ml-auto">
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            </div>
          )
        })}
        {task.comments.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">No comments yet. Start the conversation.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Textarea
          placeholder="Write a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          disabled={busy}
        />
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()} className="self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
