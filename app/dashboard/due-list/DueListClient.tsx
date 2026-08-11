"use client"

import { useState } from "react"
import { sendDueReminders } from "@/app/actions/finance"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Mail, MessageSquare, Send, AlertTriangle, Wallet, TrendingDown, MoreHorizontal, Eye, Banknote, Download, FileText, Table as TableIcon, X, CheckCircle2 } from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import SectionCard from "@/components/somiti/SectionCard"

interface DueMember {
  id: string
  fullName: string
  memberNo: string
  phone: string
  email: string | null
  totalExpected: number
  totalFines: number
  totalPaid: number
  totalDue: number
}

export default function DueListClient({ members }: { members: DueMember[] }) {
  const [loading, setLoading] = useState(false)
  const [ledgerMember, setLedgerMember] = useState<DueMember | null>(null)

  const handleSendReminders = async () => {
    if (!confirm(`Send SMS and Email reminders to ${members.length} members?`)) return
    setLoading(true)
    toast.info("Processing...", { description: "Sending SMS and Email reminders. This may take a minute." })

    try {
      const result = await sendDueReminders()
      if (result?.success) {
        toast.success("Reminders Sent!", {
          description: `${result.smsCount} SMS, ${result.emailCount} Emails sent successfully.`
        })
      }
    } catch (error) {
      toast.error("Failed", { description: "Could not send reminders." })
    }
    setLoading(false)
  }

  // Export to CSV Logic
  const handleExportCSV = () => {
    const headers = ["Member No", "Full Name", "Phone", "Email", "Total Expected", "Late Fines", "Total Paid", "Net Due"]
    const rows = members.map(m => [
      m.memberNo, m.fullName, m.phone, m.email || "N/A",
      m.totalExpected, m.totalFines, m.totalPaid, m.totalDue,
    ])

    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", "due_list.csv")
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Export to PDF (Print) Logic
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    const tableRows = members.map(m => `
      <tr>
        <td>${m.memberNo}</td>
        <td>${m.fullName}</td>
        <td>${m.phone}</td>
        <td style="text-align: right;">৳ ${m.totalExpected.toLocaleString()}</td>
        <td style="text-align: right;">৳ ${m.totalFines.toLocaleString()}</td>
        <td style="text-align: right;">৳ ${m.totalPaid.toLocaleString()}</td>
        <td style="text-align: right; font-weight: bold;">৳ ${m.totalDue.toLocaleString()}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Due List - Future Savings Foundation</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h2 { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
          </style>
        </head>
        <body>
          <h2>Future Savings Foundation - Due List</h2>
          <table>
            <thead>
              <tr>
                <th>Member No</th>
                <th>Full Name</th>
                <th>Phone</th>
                <th style="text-align: right;">Expected</th>
                <th style="text-align: right;">Fines</th>
                <th style="text-align: right;">Paid</th>
                <th style="text-align: right;">Net Due</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const totalDueAmount = members.reduce((acc, m) => acc + m.totalDue, 0)
  const totalFines = members.reduce((acc, m) => acc + m.totalFines, 0)

  return (
    <div className="space-y-8">
      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Members with Due" value={members.length.toLocaleString()} icon={AlertTriangle} accent="amber" />
        <StatCard label="Total Due Amount" value={<Money amount={totalDueAmount} />} icon={Wallet} accent="crimson" />
        <StatCard label="Total Late Fines" value={<Money amount={totalFines} />} icon={TrendingDown} accent="amber" />
      </div>

      {/* Actions bar */}
      <div className="flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[var(--border-base)] bg-surface px-4 t-body font-medium text-secondary-ink shadow-sm transition-colors hover:bg-subtle hover:text-primary-ink disabled:pointer-events-none disabled:opacity-50 outline-none"
            disabled={members.length === 0}
          >
            <Download className="h-5 w-5" /> Export
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer gap-2.5"><TableIcon className="h-4 w-4" /> Export to CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer gap-2.5"><FileText className="h-4 w-4" /> Export to PDF (Print)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={handleSendReminders} disabled={loading || members.length === 0} className="brand-gradient h-12 px-6 shadow-brand-glow">
          <Send className="mr-2 h-5 w-5" /> Send All Reminders
        </Button>
      </div>

      {/* Due List Table */}
      <SectionCard icon={<AlertTriangle />} accent="amber" title="Members Due List">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="t-overline px-6 py-4 text-muted-ink">Member</TableHead>
                <TableHead className="t-overline px-6 py-4 text-muted-ink">Contact</TableHead>
                <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Expected</TableHead>
                <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Fines</TableHead>
                <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Paid</TableHead>
                <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Net Due</TableHead>
                <TableHead className="t-overline px-6 py-4 text-right text-muted-ink">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <CheckCircle2 className="mb-3 h-12 w-12 text-success" />
                      <p className="t-h3 text-primary-ink">All Clear!</p>
                      <p className="t-body text-muted-ink">No members have pending dues.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                    <TableCell className="px-6 py-4">
                      <p className="t-subheading text-primary-ink">{member.fullName}</p>
                      <p className="t-num t-caption mt-0.5 text-brand">{member.memberNo}</p>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="t-body flex items-center gap-1.5 text-secondary-ink">
                          <MessageSquare className="h-3.5 w-3.5 text-faint-ink" /> {member.phone}
                        </span>
                        {member.email && (
                          <span className="t-caption flex items-center gap-1.5 text-muted-ink">
                            <Mail className="h-3.5 w-3.5" /> {member.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right"><Money amount={member.totalExpected} className="t-body text-secondary-ink" /></TableCell>
                    <TableCell className="px-6 py-4 text-right"><Money amount={member.totalFines} className="t-body font-medium text-debit" /></TableCell>
                    <TableCell className="px-6 py-4 text-right"><Money amount={member.totalPaid} className="t-body font-medium text-success" /></TableCell>
                    <TableCell className="px-6 py-4 text-right"><Money amount={member.totalDue} className="t-subheading font-bold text-debit" /></TableCell>
                    <TableCell className="relative z-10 px-6 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="cursor-pointer rounded-md p-2 outline-none transition-colors hover:bg-subtle">
                          <MoreHorizontal className="h-4 w-4 text-muted-ink" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setLedgerMember(member)} className="gap-2.5"><Eye className="h-4 w-4" /> View Due Ledger</DropdownMenuItem>
                          <DropdownMenuItem className="p-0">
                            <a href="/dashboard/collection-entry" className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Banknote className="h-4 w-4" /> Collect Dues</a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="p-0">
                            <a href={`mailto:${member.email}`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><Mail className="h-4 w-4" /> Send Email</a>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="p-0">
                            <a href={`sms:${member.phone}`} className="flex w-full cursor-pointer items-center gap-2.5 p-2"><MessageSquare className="h-4 w-4" /> Send SMS</a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Due Ledger Popup Modal */}
      <Dialog open={!!ledgerMember} onOpenChange={(open) => !open && setLedgerMember(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="t-h3 text-primary-ink">Due Ledger: {ledgerMember?.fullName}</span>
              <button onClick={() => setLedgerMember(null)} className="text-muted-ink transition-colors hover:text-primary-ink"><X className="h-5 w-5" /></button>
            </DialogTitle>
          </DialogHeader>
          {ledgerMember && (
            <div className="space-y-4 py-4">
              <div className="flex justify-between border-b border-[var(--border-base)] pb-2 t-body">
                <span className="text-muted-ink">Total Expected:</span>
                <Money amount={ledgerMember.totalExpected} className="font-bold text-primary-ink" />
              </div>
              <div className="flex justify-between border-b border-[var(--border-base)] pb-2 t-body">
                <span className="text-muted-ink">Late Fines Applied:</span>
                <Money amount={ledgerMember.totalFines} className="font-bold text-debit" />
              </div>
              <div className="flex justify-between border-b border-[var(--border-base)] pb-2 t-body">
                <span className="text-muted-ink">Total Paid:</span>
                <Money amount={ledgerMember.totalPaid} className="font-bold text-success" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="t-subheading font-bold text-primary-ink">Net Due Balance:</span>
                <Money amount={ledgerMember.totalDue} className="t-h2 font-extrabold text-debit" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
