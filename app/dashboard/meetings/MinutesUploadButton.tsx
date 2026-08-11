"use client"

// Minutes upload / replace control (rule 6). Wraps a hidden file input and
// calls uploadMeetingMinutes (first upload) or replaceMeetingMinutes
// (Super Admin replace). Locked for normal users — the parent hides the
// button entirely when there's nothing the user can do.

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { uploadMeetingMinutes, replaceMeetingMinutes } from "@/app/actions/meeting"

export default function MinutesUploadButton({
  meetingId,
  replace = false,
  label = "Upload Minutes",
}: {
  meetingId: string
  replace?: boolean
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const onFile = (file: File | null) => {
    if (!file) return
    const fd = new FormData()
    fd.append("minutes", file)
    startTransition(async () => {
      try {
        if (replace) {
          await replaceMeetingMinutes(meetingId, fd)
        } else {
          await uploadMeetingMinutes(meetingId, fd)
        }
        toast.success("Meeting minutes uploaded.")
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Upload failed.")
      }
    })
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        size="sm"
        variant={replace ? "outline" : "default"}
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className={replace ? "" : "bg-indigo-600 hover:bg-indigo-700"}
      >
        {pending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
        {label}
      </Button>
    </>
  )
}
