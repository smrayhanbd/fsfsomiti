"use client"

import { useState, useTransition } from "react"
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  toggleBankAccountStatus,
  setDefaultBankAccount,
} from "@/app/actions/finance"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Landmark, Plus, Star, Trash2, Pencil, AlertTriangle } from "lucide-react"
import Link from "next/link"
import type { PaymentMethod } from "@/lib/transactions/types"
import type { AccountType } from "@/lib/accounting"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import StatusBadge from "@/components/somiti/StatusBadge"

interface BankAccountRow {
  id: string
  accountName: string
  bankName: string | null
  accountNumber: string | null
  branch: string | null
  paymentMethod: PaymentMethod
  coaAccountId: string
  coaAccountCode: string
  coaAccountName: string
  isActive: boolean
  isDefault: boolean
}

interface AccountOption {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  isCash: boolean
  isBank: boolean
}

/** The 3 collection-method groups shown in the UI. */
const METHOD_GROUPS = [
  { group: "CASH", label: "Cash", methods: ["CASH"] as PaymentMethod[] },
  { group: "BANK", label: "Bank Transfer / Cheque", methods: ["BANK_TRANSFER", "CHEQUE"] as PaymentMethod[] },
  { group: "MOBILE", label: "Mobile Banking", methods: ["BKASH", "NAGAD", "ROCKET"] as PaymentMethod[] },
] as const

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

const GROUP_TONE: Record<string, string> = {
  CASH: "bg-success-soft text-success border-success",
  BANK: "bg-info-soft text-info border-info",
  MOBILE: "bg-brand-gradient-soft text-brand border-brand",
}

function groupForMethod(method: PaymentMethod): string {
  if (method === "CASH") return "CASH"
  if (method === "BANK_TRANSFER" || method === "CHEQUE") return "BANK"
  return "MOBILE"
}

export default function BankAccountsClient({
  bankAccounts,
  accounts,
}: {
  bankAccounts: BankAccountRow[]
  accounts: AccountOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccountRow | null>(null)

  const [fAccountName, setFAccountName] = useState("")
  const [fBankName, setFBankName] = useState("")
  const [fAccountNumber, setFAccountNumber] = useState("")
  const [fBranch, setFBranch] = useState("")
  const [fPaymentMethod, setFPaymentMethod] = useState<PaymentMethod>("CASH")
  const [fCoaAccountId, setFCoaAccountId] = useState("")
  const [fIsDefault, setFIsDefault] = useState(false)

  const resetForm = () => {
    setFAccountName(""); setFBankName(""); setFAccountNumber(""); setFBranch("")
    setFPaymentMethod("CASH"); setFCoaAccountId(""); setFIsDefault(false); setEditing(null)
  }

  const openCreate = () => { resetForm(); setDialogOpen(true) }

  const openEdit = (row: BankAccountRow) => {
    setEditing(row)
    setFAccountName(row.accountName); setFBankName(row.bankName ?? "")
    setFAccountNumber(row.accountNumber ?? ""); setFBranch(row.branch ?? "")
    setFPaymentMethod(row.paymentMethod); setFCoaAccountId(row.coaAccountId)
    setFIsDefault(row.isDefault); setDialogOpen(true)
  }

  const buildFormData = () => {
    const fd = new FormData()
    fd.append("accountName", fAccountName); fd.append("bankName", fBankName)
    fd.append("accountNumber", fAccountNumber); fd.append("branch", fBranch)
    fd.append("paymentMethod", fPaymentMethod); fd.append("coaAccountId", fCoaAccountId)
    fd.append("isDefault", fIsDefault ? "YES" : "NO")
    return fd
  }

  const handleSubmit = () => {
    if (!fAccountName.trim()) return toast.error("Account name is required.")
    if (!fCoaAccountId) return toast.error("Select a Chart-of-Accounts account.")
    startTransition(async () => {
      try {
        if (editing) { await updateBankAccount(editing.id, buildFormData()); toast.success("Bank account updated") }
        else { await createBankAccount(buildFormData()); toast.success("Bank account created") }
        setDialogOpen(false); resetForm()
      } catch (error) {
        toast.error("Could not save", { description: error instanceof Error ? error.message : "Failed" })
      }
    })
  }

  const handleToggleActive = (row: BankAccountRow) => {
    startTransition(async () => {
      try { await toggleBankAccountStatus(row.id, !row.isActive); toast.success(`Account ${!row.isActive ? "activated" : "deactivated"}`) }
      catch (error) { toast.error("Failed", { description: error instanceof Error ? error.message : undefined }) }
    })
  }

  const handleSetDefault = (row: BankAccountRow) => {
    if (row.isDefault) return
    startTransition(async () => {
      try { await setDefaultBankAccount(row.id, row.paymentMethod); toast.success(`Default ${groupForMethod(row.paymentMethod).toLowerCase()} account updated`) }
      catch (error) { toast.error("Failed", { description: error instanceof Error ? error.message : undefined }) }
    })
  }

  const handleDelete = (row: BankAccountRow) => {
    if (!confirm(`Delete "${row.accountName}"? This cannot be undone.`)) return
    startTransition(async () => {
      try { await deleteBankAccount(row.id); toast.success("Bank account deleted") }
      catch (error) { toast.error("Failed", { description: error instanceof Error ? error.message : undefined }) }
    })
  }

  const missingDefaults = METHOD_GROUPS.filter(
    (g) => !bankAccounts.some((b) => b.isDefault && b.isActive && groupForMethod(b.paymentMethod) === g.group)
  ).map((g) => g.label)

  const inputCls = "bg-[var(--control-bg)]"

  return (
    <div className="space-y-8">
      <PageHeader
        title="Active Bank Accounts"
        subtitle="Map each Collection Method to the Chart-of-Accounts account that should receive deposits. The Deposit form auto-selects the default account for the chosen method."
      />

      {/* Coverage warning */}
      {missingDefaults.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning bg-warning-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="t-body text-warning">
            <p className="font-semibold">No default account configured for: {missingDefaults.join(", ")}.</p>
            <p className="mt-0.5">
              The Deposit form cannot auto-map these methods until a default is set. Mark one account per
              group as default (★), or collectors will have to pick the COA manually.{" "}
              <Link href="/dashboard/transactions/deposits" className="font-medium underline">
                Go to Deposit form →
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT: Add/Edit form */}
        <div className="lg:col-span-1">
          <SectionCard title={editing ? "Edit Account" : "Add Account"} icon={<Plus />} className="lg:sticky lg:top-6">
            <div className="space-y-3">
              <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm() }}>
                <DialogTrigger
                  className="brand-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium text-white shadow-brand-glow disabled:pointer-events-none disabled:opacity-50"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" /> New Bank Account
                </DialogTrigger>
                <DialogContent className="max-w-lg rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>{editing ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Account Name *</Label>
                      <Input value={fAccountName} onChange={(e) => setFAccountName(e.target.value)} placeholder="e.g. Cash Drawer — Counter 1" className={inputCls} />
                    </div>
                    <div className="space-y-2"><Label>Bank / Provider</Label><Input value={fBankName} onChange={(e) => setFBankName(e.target.value)} placeholder="e.g. City Bank / bKash" className={inputCls} /></div>
                    <div className="space-y-2"><Label>Account / Wallet No.</Label><Input value={fAccountNumber} onChange={(e) => setFAccountNumber(e.target.value)} placeholder="masked number" className={inputCls} /></div>
                    <div className="space-y-2"><Label>Branch</Label><Input value={fBranch} onChange={(e) => setFBranch(e.target.value)} placeholder="optional" className={inputCls} /></div>
                    <div className="space-y-2">
                      <Label>Collection Method *</Label>
                      <Select value={fPaymentMethod} onValueChange={(v) => v && setFPaymentMethod(v as PaymentMethod)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {METHOD_GROUPS.map((g) => (
                            <SelectGroup key={g.group}>
                              <SelectLabel>{g.label}</SelectLabel>
                              {g.methods.map((m) => (<SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Received COA (Chart-of-Accounts) *</Label>
                      <Select value={fCoaAccountId} onValueChange={(v) => v && setFCoaAccountId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select COA account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-1 md:col-span-2">
                      <Checkbox id="isDefault" checked={fIsDefault} onCheckedChange={(v) => setFIsDefault(v === true)} />
                      <Label htmlFor="isDefault" className="cursor-pointer font-normal t-body">
                        Set as default for this collection method group
                      </Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Cancel</Button>
                    <Button disabled={isPending} onClick={handleSubmit} className="brand-gradient shadow-brand-glow">
                      {isPending ? "Saving…" : editing ? "Save Changes" : "Create Account"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <p className="pt-2 t-caption leading-relaxed text-muted-ink">
                Tip: pick a COA that matches the method — Cash accounts for <em>Cash</em>, Bank accounts
                for <em>Bank/Cheque</em>, and a Mobile Wallet account for <em>Mobile Banking</em>.
                The ★ star marks the default that the Deposit form auto-selects.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT: existing accounts table */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="t-h2 text-primary-ink">Existing Bank Accounts</h2>
          <SectionCard bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                  <TableHead className="t-overline px-4 py-3 text-muted-ink">Account</TableHead>
                  <TableHead className="t-overline px-4 py-3 text-muted-ink">Method</TableHead>
                  <TableHead className="t-overline px-4 py-3 text-muted-ink">Received COA</TableHead>
                  <TableHead className="t-overline px-4 py-3 text-center text-muted-ink">Default</TableHead>
                  <TableHead className="t-overline px-4 py-3 text-center text-muted-ink">Active</TableHead>
                  <TableHead className="t-overline px-4 py-3 text-right text-muted-ink">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.length === 0 ? (
                  <TableRow className="border-[var(--border-base)]">
                    <TableCell colSpan={6} className="py-10 text-center t-body text-muted-ink">
                      No bank accounts configured yet. Add one to enable auto-mapping on the Deposit form.
                    </TableCell>
                  </TableRow>
                ) : (
                  bankAccounts.map((b) => {
                    const group = groupForMethod(b.paymentMethod)
                    return (
                      <TableRow key={b.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                        <TableCell className="px-4 py-4">
                          <div className="t-subheading text-primary-ink">{b.accountName}</div>
                          {(b.bankName || b.accountNumber) && (
                            <div className="t-caption text-muted-ink">
                              {[b.bankName, b.accountNumber, b.branch].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <Badge variant="outline" className={GROUP_TONE[group]}>
                            {METHOD_LABEL[b.paymentMethod]}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4">
                          <div className="t-body font-medium text-secondary-ink">{b.coaAccountName}</div>
                          <div className="t-num t-caption text-muted-ink">{b.coaAccountCode}</div>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-center">
                          <button
                            type="button"
                            disabled={isPending || !b.isActive}
                            onClick={() => handleSetDefault(b)}
                            title={b.isDefault ? "Default for this group" : "Set as default"}
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Star className={`h-4 w-4 ${b.isDefault ? "fill-[var(--status-warning)] text-warning" : "text-faint-ink"}`} />
                          </button>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-center">
                          <Switch checked={b.isActive} onCheckedChange={() => handleToggleActive(b)} />
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-ink hover:text-brand" onClick={() => openEdit(b)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-debit hover:bg-debit-soft" onClick={() => handleDelete(b)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
