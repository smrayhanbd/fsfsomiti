"use client"

import { useRef, useState } from "react"
import { submitProfilePhotoRequest } from "@/app/actions/portal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Camera, Upload, Loader2 } from "lucide-react"

export default function PhotoUploadDialog({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setPreview(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File too large", { description: "Image must be under 5 MB." })
      return
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Invalid file", { description: "Please choose an image file." })
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (!file) {
      toast.error("No image selected")
      return
    }
    setLoading(true)
    try {
      const result = await submitProfilePhotoRequest(memberId, file)
      if (result?.error) {
        toast.error("Error", { description: result.error })
      } else if (result?.success) {
        toast.success("Submitted", { description: result.success })
        setOpen(false)
        reset()
      }
    } catch {
      toast.error("Error", { description: "Something went wrong uploading the photo." })
    }
    setLoading(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger
        className="inline-flex shrink-0 h-10 items-center justify-center gap-1.5 rounded-[10px] brand-gradient text-white shadow-brand-glow hover:opacity-90 px-3 text-sm font-medium transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Camera className="h-3.5 w-3.5" /> Change Photo
      </DialogTrigger>
      <DialogContent className="max-w-md bg-white dark:bg-slate-950 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Update Profile Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center gap-3">
            <div className="h-28 w-28 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-lg">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-10 w-10 text-slate-300" />
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
              id="photo-input"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              <Upload className="h-4 w-4 mr-1.5" /> Choose Image
            </Button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
            Your new photo will be sent to management for approval. It will appear on your profile once approved.
          </p>
          <Button onClick={handleSubmit} disabled={loading || !file} className="w-full bg-indigo-600 hover:bg-indigo-700">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading...
              </>
            ) : (
              "Submit for Approval"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
