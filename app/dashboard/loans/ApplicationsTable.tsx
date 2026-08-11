"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { approveLoan, rejectLoan, disburseLoan } from "@/app/actions/loan"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle2, XCircle, Landmark, Eye, Clock } from "lucide-react"

export interface ApplicationRow {
  id: string
  loanNo: string
  status: string
  memberName: string
  memberNo: string
  memberPhone: string
  memberId: string
  productName: string
  principal: number
  totalPayable: number
  applicationDate: string
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  APPROVED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  REJECTED: "bg-red-500/10 text-red-600 border-red-500/20",
}

export default function ApplicationsTable({ applications }: { applications: ApplicationRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [disburseId, setDisburseId] = useState<string | null>(null)
  const [method, setMethod] = useState("CASH")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const run = async (id: string, fn: () => Promise<unknown>, msg: string, close?: () => void) => {
    setBusyId(id)
    try {
      await fn()
      toast.success(msg)
      close?.()
      router.refresh()
    } catch (e) {
      toast.error("Failed", { description: e instanceof Error ? e.message : "Failed" })
    } finally {
      setBusyId(null)
    }
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 rounded-full bg-emerald-50 dark:bg-emerald-950/40 mb-4 ring-4 ring-white dark:ring-slate-900">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No applications pending</h3>
        <p className="text-slate-500 max-w-sm mt-1">New loan applications and approved loans awaiting disbursement will show up here.</p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
            <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Loan / Member</TableHead>
            <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Product</TableHead>
            <TableHead className="px-4 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
            <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Applied</TableHead>
            <TableHead className="px-4 py-3 text-center text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
            <TableHead className="px-4 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((a) => (
            <TableRow key={a.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
              <TableCell className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 font-bold text-xs">
                    {a.memberName.charAt(0)}
                  </div>
                  <div>
                    <Link href={`/dashboard/loans/${a.id}`} className="font-semibold text-sm text-slate-900 dark:text-white hover:underline">
                      {a.memberName}
                    </Link>
                    <p className="text-[11px] text-slate-500 font-mono">{a.loanNo} · {a.memberNo}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{a.productName}</TableCell>
              <TableCell className="px-4 py-3 text-right">
                <p className="font-bold text-sm text-slate-900 dark:text-white">৳ {a.principal.toLocaleString()}</p>
                <p className="text-[11px] text-slate-400">Payable ৳ {a.totalPayable.toLocaleString()}</p>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-slate-500">{new Date(a.applicationDate).toLocaleDateString()}</TableCell>
              <TableCell className="px-4 py-3 text-center">
                <Badge variant="outline" className={`uppercase text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[a.status] || ""}`}>
                  {a.status}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={`/dashboard/loans/${a.id}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-indigo-600">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  {a.status === "PENDING" && (
                    <>
                      <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === a.id}
                        onClick={() => run(a.id, () => approveLoan(a.id), "Approved")}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => { setRejectId(a.id); setReason("") }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {a.status === "APPROVED" && (
                    <Button size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700" disabled={busyId === a.id}
                      onClick={() => setDisburseId(a.id)}>
                      <Landmark className="h-4 w-4 mr-1" /> Disburse
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Disburse dialog */}
      <Dialog open={!!disburseId} onOpenChange={(o) => !o && setDisburseId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Disburse Loan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? "CASH")}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BKASH">bKash</SelectItem>
                  <SelectItem value="BANK">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-white dark:bg-slate-950" />
            </div>
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700"
              onClick={() => disburseId && run(disburseId, () => disburseLoan(disburseId, method, date), "Disbursed", () => setDisburseId(null))}>
              Confirm Disbursement
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Loan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Insufficient savings" className="bg-white dark:bg-slate-950" />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700"
              onClick={() => rejectId && run(rejectId, () => rejectLoan(rejectId, reason), "Rejected", () => setRejectId(null))}>
              Confirm Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
