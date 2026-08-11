"use client"

import { useState, useEffect, useMemo } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createAccount, updateAccount, type ActionResult } from "@/app/actions/accounts"
import { toast } from "sonner"
import { Plus, Save, Pencil, Loader2 } from "lucide-react"
import type { AccountNode, AccountType, AccountNature, AccountStatus } from "@/lib/accounting"
import { ACCOUNT_TYPE_META, defaultNatureFor } from "@/lib/accounting"

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const accountSchema = z.object({
  accountCode: z
    .string()
    .min(1, "Account code is required")
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
  accountName: z.string().min(1, "Account name is required"),
  parentAccountId: z.string().optional().nullable(),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  category: z.string().optional(),
  nature: z.enum(["DEBIT", "CREDIT"]),
  openingBalance: z.coerce.number().min(0, "Cannot be negative").default(0),
  currency: z.string().min(1, "Required").default("BDT"),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  isBank: z.boolean().default(false),
  isCash: z.boolean().default(false),
  allowPosting: z.boolean().default(true),
  allowJournal: z.boolean().default(true),
  taxDeductible: z.boolean().default(false),
})

type AccountFormValues = z.infer<typeof accountSchema>

interface AccountModalProps {
  accounts: AccountNode[]
  /** When provided, the modal operates in edit mode for this account. */
  editing?: AccountNode | null
  /** Preselected parent — used by the "Add Sub-account" action. */
  presetParentId?: string | null
  /** Override the trigger button. Defaults to the create button. */
  trigger?: React.ReactNode
}

const TYPE_OPTIONS: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]

export default function AccountModal({
  accounts,
  editing = null,
  presetParentId = null,
  trigger,
}: AccountModalProps) {
  const [open, setOpen] = useState(false)

  const isEdit = !!editing

  // Build a flat list of accounts (type-grouped) for the parent select.
  const flatAccounts = useMemo(() => {
    const walk = (nodes: AccountNode[], depth = 0): { node: AccountNode; depth: number }[] => {
      const out: { node: AccountNode; depth: number }[] = []
      for (const n of nodes) {
        out.push({ node: n, depth })
        if (n.childAccounts?.length) out.push(...walk(n.childAccounts, depth + 1))
      }
      return out
    }
    return walk(accounts)
  }, [accounts])

  const defaults: AccountFormValues = useMemo(() => {
    if (editing) {
      return {
        accountCode: editing.accountCode,
        accountName: editing.accountName,
        parentAccountId: editing.parentAccountId ?? null,
        accountType: editing.accountType,
        category: editing.category ?? "",
        nature: editing.nature,
        openingBalance: Number(editing.openingBalance ?? 0),
        currency: editing.currency || "BDT",
        description: editing.description ?? "",
        status: editing.status,
        isBank: editing.isBank,
        isCash: editing.isCash,
        allowPosting: editing.allowPosting,
        allowJournal: editing.allowJournal,
        taxDeductible: editing.taxDeductible ?? false,
      }
    }
    return {
      accountCode: "",
      accountName: "",
      parentAccountId: presetParentId ?? null,
      accountType: "ASSET",
      category: "",
      nature: "DEBIT",
      openingBalance: 0,
      currency: "BDT",
      description: "",
      status: "ACTIVE",
      isBank: false,
      isCash: false,
      allowPosting: true,
      allowJournal: true,
      taxDeductible: false,
    }
  }, [editing, presetParentId])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema) as Resolver<AccountFormValues>,
    defaultValues: defaults,
  })

  // Reset the form whenever the dialog opens so the right defaults apply.
  useEffect(() => {
    if (open) reset(defaults)
  }, [open, defaults, reset])

  const accountType = watch("accountType")
  const parentAccountId = watch("parentAccountId")

  // When the account type changes and no parent forces a value, auto-pick the
  // conventional nature so users don't have to think about debit/credit rules.
  useEffect(() => {
    setValue("nature", defaultNatureFor(accountType))
  }, [accountType, setValue])

  // Suggest the next child code based on the chosen parent.
  const suggestedCode = useMemo(() => {
    if (editing) return null
    if (!parentAccountId) return null
    const parent = flatAccounts.find((f) => f.node.id === parentAccountId)?.node
    if (!parent) return null
    const siblings = flatAccounts
      .filter((f) => f.node.parentAccountId === parentAccountId)
      .map((f) => f.node.accountCode)
    let i = 1
    let candidate = `${parent.accountCode}${i}`
    while (siblings.includes(candidate)) {
      i += 1
      candidate = `${parent.accountCode}${i}`
    }
    return candidate
  }, [parentAccountId, flatAccounts, editing])

  const onSubmit = async (values: AccountFormValues) => {
    // Convert to FormData so we reuse the existing server-action contract.
    const fd = new FormData()
    Object.entries(values).forEach(([key, value]) => {
      if (value == null) return
      if (typeof value === "boolean") {
        if (value) fd.set(key, "on")
      } else {
        fd.set(key, String(value))
      }
    })

    const res: ActionResult = isEdit && editing
      ? await updateAccount(editing.id, fd)
      : await createAccount(fd)

    if (res.ok) {
      toast.success(isEdit ? "Account updated" : "Account created", {
        description: `${values.accountCode} — ${values.accountName}`,
      })
      setOpen(false)
    } else {
      toast.error("Could not save account", { description: res.error })
    }
  }

  const defaultTrigger = isEdit ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-slate-400 hover:text-indigo-600"
      title="Edit account"
    >
      <Pencil className="h-4 w-4" />
    </Button>
  ) : (
    <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
      <Plus className="mr-2 h-4 w-4" /> Add New Account
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={(trigger ?? defaultTrigger) as React.ReactElement} />
      <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white">
            {isEdit ? "Edit Account" : "Create New Account"}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {isEdit
              ? "Update the details of this ledger account."
              : "Define a new account in your chart of accounts."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 max-h-[68vh] overflow-y-auto pr-1"
        >
          {/* Code + Name */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Account Code" required error={errors.accountCode?.message}>
              <div className="flex gap-2">
                <Input {...register("accountCode")} placeholder="e.g. 1010" />
                {suggestedCode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => setValue("accountCode", suggestedCode)}
                  >
                    Use {suggestedCode}
                  </Button>
                )}
              </div>
            </Field>
            <Field label="Account Name" required error={errors.accountName?.message}>
              <Input {...register("accountName")} placeholder="e.g. Cash in Hand" />
            </Field>
          </div>

          {/* Parent + Type */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Parent Account">
              <Select
                value={parentAccountId ?? undefined}
                onValueChange={(v) => setValue("parentAccountId", v || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None (Root Account)" />
                </SelectTrigger>
                <SelectContent>
                  {(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as AccountType[]).map((t) => {
                    const items = flatAccounts.filter((f) => f.node.accountType === t)
                    if (!items.length) return null
                    const meta = ACCOUNT_TYPE_META[t]
                    return (
                      <SelectGroup key={t}>
                        <SelectLabel>{meta.label}</SelectLabel>
                        {items.map(({ node, depth }) => (
                          <SelectItem key={node.id} value={node.id}>
                            <span style={{ paddingLeft: depth * 12 }} className="font-mono text-xs text-slate-400">
                              {node.accountCode}
                            </span>
                            {node.accountName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account Type" required error={errors.accountType?.message}>
              <Select
                value={accountType}
                onValueChange={(v) => setValue("accountType", v as AccountType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => {
                    const meta = ACCOUNT_TYPE_META[t]
                    return (
                      <SelectItem key={t} value={t}>
                        <span className={`inline-block w-2 h-2 rounded-full mr-1 ${meta.dot}`} />
                        {meta.label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Nature + Opening Balance */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nature" required error={errors.nature?.message}>
              <Select
                value={watch("nature")}
                onValueChange={(v) => setValue("nature", v as AccountNature)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Nature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">Debit</SelectItem>
                  <SelectItem value="CREDIT">Credit</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Opening Balance (৳)" error={errors.openingBalance?.message}>
              <Input type="number" step="0.01" {...register("openingBalance")} />
            </Field>
          </div>

          {/* Category + Description */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Input {...register("category")} placeholder="e.g. Current Asset" />
            </Field>
            <Field label="Description">
              <Input {...register("description")} placeholder="Optional notes" />
            </Field>
          </div>

          {/* Currency + Status */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Currency" error={errors.currency?.message}>
              <Select
                value={watch("currency")}
                onValueChange={(v) => setValue("currency", v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {["BDT", "USD", "EUR", "GBP", "INR"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={watch("status")}
                onValueChange={(v) => setValue("status", v as AccountStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Flags */}
          <div className="grid grid-cols-2 gap-3 pt-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4">
            <ToggleRow
              label="Bank Account"
              hint="Use for bank/cash equivalents"
              checked={watch("isBank")}
              onCheckedChange={(v) => setValue("isBank", v)}
            />
            <ToggleRow
              label="Cash Account"
              hint="Petty cash / cash in hand"
              checked={watch("isCash")}
              onCheckedChange={(v) => setValue("isCash", v)}
            />
            <ToggleRow
              label="Allow Posting"
              hint="Accept direct journal lines"
              checked={watch("allowPosting")}
              onCheckedChange={(v) => setValue("allowPosting", v)}
            />
            <ToggleRow
              label="Allow Journal"
              hint="Available in voucher entry"
              checked={watch("allowJournal")}
              onCheckedChange={(v) => setValue("allowJournal", v)}
            />
            <ToggleRow
              label="Tax Deductible"
              hint="Mark for tax reporting"
              checked={watch("taxDeductible")}
              onCheckedChange={(v) => setValue("taxDeductible", v)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isEdit ? (
                <Save className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
