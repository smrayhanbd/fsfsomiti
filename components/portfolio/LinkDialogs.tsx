"use client"

// Investment ↔ Project linking dialogs. Two thin client components that call
// the linking server actions and refresh the page on success.
//
//   <LinkInvestmentToProject projectId={...} options={investments} />
//   <LinkProjectToInvestment investmentId={...} options={projects} />

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Link2, Plus } from "lucide-react"
import { linkProjectInvestment } from "@/app/actions/projects"
import { linkInvestmentProject } from "@/app/actions/investments"

const FIELD_H = "h-10 data-[size=default]:h-10"

// ── Project side: link an investment to THIS project ────────────────────
interface InvestmentOption { id: string; investmentNo: string; name: string }

export function LinkInvestmentToProject({
  projectId,
  options,
  linkedIds,
}: {
  projectId: string
  options: InvestmentOption[]
  linkedIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [investmentId, setInvestmentId] = useState("")
  const [relationshipType, setRelationshipType] = useState("FUNDS_PROJECT")
  const [note, setNote] = useState("")

  const available = options.filter((o) => !linkedIds.includes(o.id))

  const handleSubmit = () => {
    if (!investmentId) return toast.error("Select an investment to link.")
    startTransition(async () => {
      const res = await linkProjectInvestment({
        investmentId,
        projectId,
        relationshipType: relationshipType as "FUNDS_PROJECT" | "MANAGES_ASSET",
        relationshipNote: note || null,
      })
      if (!res.ok) { toast.error("Could not link", { description: res.error }); return }
      toast.success("Investment linked")
      setOpen(false)
      setInvestmentId("")
      setNote("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Link2 className="mr-1.5 h-4 w-4" /> Link Investment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Investment to Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {available.length === 0 ? (
            <p className="t-body text-muted-ink">All investments are already linked to this project.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Select Investment</Label>
                <Select value={investmentId} onValueChange={(v) => setInvestmentId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Choose an investment" /></SelectTrigger>
                  <SelectContent>
                    {available.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.investmentNo} — {o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship Type</Label>
                <Select value={relationshipType} onValueChange={(v) => setRelationshipType(v ?? "FUNDS_PROJECT")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FUNDS_PROJECT">This investment funds the project</SelectItem>
                    <SelectItem value="MANAGES_ASSET">This project manages the asset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="bg-[var(--control-bg)]" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="brand-gradient" disabled={isPending || available.length === 0} onClick={handleSubmit}>
            {isPending ? "Linking…" : "Link Investment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Investment side: link a project to THIS investment ──────────────────
interface ProjectOption { id: string; projectNo: string; name: string }

export function LinkProjectToInvestment({
  investmentId,
  options,
  linkedIds,
}: {
  investmentId: string
  options: ProjectOption[]
  linkedIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [projectId, setProjectId] = useState("")
  const [relationshipType, setRelationshipType] = useState("FUNDS_PROJECT")
  const [note, setNote] = useState("")

  const available = options.filter((o) => !linkedIds.includes(o.id))

  const handleSubmit = () => {
    if (!projectId) return toast.error("Select a project to link.")
    startTransition(async () => {
      const res = await linkInvestmentProject({
        investmentId,
        projectId,
        relationshipType: relationshipType as "FUNDS_PROJECT" | "MANAGES_ASSET",
        relationshipNote: note || null,
      })
      if (!res.ok) { toast.error("Could not link", { description: res.error }); return }
      toast.success("Project linked")
      setOpen(false)
      setProjectId("")
      setNote("")
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Link2 className="mr-1.5 h-4 w-4" /> Link Project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Project to Investment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {available.length === 0 ? (
            <p className="t-body text-muted-ink">All projects are already linked to this investment.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Select Project</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Choose a project" /></SelectTrigger>
                  <SelectContent>
                    {available.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.projectNo} — {o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship Type</Label>
                <Select value={relationshipType} onValueChange={(v) => setRelationshipType(v ?? "FUNDS_PROJECT")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FUNDS_PROJECT">This investment funds the project</SelectItem>
                    <SelectItem value="MANAGES_ASSET">This project manages the asset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="bg-[var(--control-bg)]" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="brand-gradient" disabled={isPending || available.length === 0} onClick={handleSubmit}>
            {isPending ? "Linking…" : "Link Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Investment side: shortcut button → create a NEW linked project ───────
// This is a navigation link to a create page, not an action. The codebase
// Button wraps Base UI's ButtonPrimitive, which (per the Base UI Button docs)
// should NOT wrap an <a> via the render/asChild pattern — links have their own
// semantics. So we render a real <Link> and apply the button look via the
// shared buttonVariants() class helper instead.
export function CreateLinkedProjectButton({ investmentId }: { investmentId: string }) {
  return (
    <Link
      href={`/dashboard/projects/create?investment=${investmentId}`}
      className={buttonVariants({ size: "sm", variant: "outline" })}
    >
      <Plus className="mr-1.5 h-4 w-4" /> Create Linked Project
    </Link>
  )
}
