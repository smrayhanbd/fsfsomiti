"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  ArrowLeft,
  Printer,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  Scale,
  Hash,
  Wallet,
  Landmark,
  Smartphone,
  Star,
} from "lucide-react"
import type { OrgInfo } from "@/lib/organization"
import type { PaymentMethod } from "@/lib/transactions/types"
import { PAYMENT_METHOD_LABELS } from "@/lib/transactions/types"
import { formatBDT, formatDate } from "@/lib/accounting"
import { amountInWordsBDT } from "@/lib/format"

// ─── Types ──────────────────────────────────────────────────────────────
interface ReceiptTxn {
  id: string
  voucherNo: string
  transactionType: "DEPOSIT" | "WITHDRAWAL"
  subType: string
  amount: number
  paymentMethod: PaymentMethod | null
  referenceNo: string | null
  remarks: string | null
  breakdown: Record<string, string> | null
  transactionDate: string
  approvedAt: string | null
  approvedBy: string | null
  /**
   * The member's total savings balance AFTER this transaction was posted.
   * Computed by the page.tsx as the sum of all savings rows up to and
   * including this transaction's date. `null` when there's no linked member.
   */
  balanceAfterTxn: number | null
}

interface ReceiptMember {
  id: string
  memberNo: string
  fullName: string
  phone: string | null
  photoUrl: string | null
  gender: string | null
}

interface ReceiptAccount {
  id: string
  accountName: string
  accountCode: string
}

interface ReceiptJournalEntry {
  voucherNo: string
  voucherType: "RECEIPT" | "PAYMENT" | "JOURNAL" | "CONTRA"
  narration: string
  totalDebit: number
  totalCredit: number
  lines: {
    id: string
    accountCode: string
    accountName: string
    debit: number
    credit: number
    memo: string | null
  }[]
}

interface ReceiptBankAccount {
  id: string
  accountName: string
  bankName: string | null
  accountNumber: string | null
  branch: string | null
  paymentMethod: PaymentMethod
  coaAccountName: string
  isDefault: boolean
}

interface Props {
  txn: ReceiptTxn
  member: ReceiptMember | null
  cashAccount: ReceiptAccount | null
  journalEntry: ReceiptJournalEntry | null
  org: OrgInfo
  bankAccounts: ReceiptBankAccount[]
}

// ─── Static UI config ───────────────────────────────────────────────────
const AVATAR_COLORS: Record<string, string> = {
  MALE: "bg-indigo-100 text-indigo-600",
  FEMALE: "bg-pink-100 text-pink-600",
  OTHER: "bg-violet-100 text-violet-600",
}

function groupForMethod(method: PaymentMethod): "CASH" | "BANK" | "MOBILE" {
  if (method === "CASH") return "CASH"
  if (method === "BANK_TRANSFER" || method === "CHEQUE") return "BANK"
  return "MOBILE"
}

const METHOD_GROUP_ICON = { CASH: Wallet, BANK: Landmark, MOBILE: Smartphone }

// The voucher is designed at a fixed desktop width (max-w-4xl = 56rem). On
// narrower viewports (phones) we don't reflow it — the fixed rows (header
// band, 2-col meta row, 3-col signature row) would overflow the screen or
// break the composition. Instead the card keeps this exact width and is
// zoomed down proportionally, so mobile sees the identical desktop view,
// just fitted to the screen. Print is always full-scale (reset in
// globals.css @media print).
const RECEIPT_DESIGN_WIDTH = 896

// SSR-safe layout effect — plain useLayoutEffect warns when the component
// is server-rendered.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

// ─── Component ──────────────────────────────────────────────────────────
export default function MoneyReceipt({
  txn,
  member,
  cashAccount,
  journalEntry,
  org,
  bankAccounts,
}: Props) {
  const router = useRouter()

  // Scale-to-fit — measure the available content width and zoom the 896px
  // voucher down when it doesn't fit. `zoom` (not `transform: scale`) keeps
  // the card in normal document flow, so page height and the print layout
  // need no manual compensation.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  useIsomorphicLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const update = () =>
      setZoom(Math.min(1, wrap.clientWidth / RECEIPT_DESIGN_WIDTH))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const isDeposit = txn.transactionType === "DEPOSIT"
  const title = isDeposit ? "MONEY RECEIPT" : "WITHDRAWAL VOUCHER"
  const purposeLabel =
    txn.breakdown?.collectionTypeName ?? (isDeposit ? "Savings Deposit" : "Withdrawal")
  // A RECEIPT voucher represents money collected FROM the member (a deposit),
  // so we label the channel "Collection Method"; outflows keep "Payment Method".
  const isReceipt = journalEntry?.voucherType === "RECEIPT"
  const methodLabel = isReceipt ? "Collection Method" : "Payment Method"

  const addressLine = [org.addressLine, org.city, org.district, org.postalCode]
    .filter(Boolean)
    .join(", ")

  const memberInitials = member
    ? member.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : ""

  const handlePrint = () => {
    if (!txn.voucherNo) {
      // Defensive — should never happen since the route 404s non-approved.
      return toast.error("Voucher not ready.")
    }
    window.print()
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-6 px-4 print:p-0 print:bg-white print:block">
      {/* On-screen toolbar — hidden in print */}
      <div className="receipt-no-print max-w-4xl mx-auto mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Button size="sm" onClick={handlePrint} className={`${isDeposit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </Button>
      </div>

      {/* ─── The printable voucher ─────────────────────────────────────── */}
      {/* `@container` + `@md:` variants below make the inner grids respond to
          the voucher's own (fixed) width rather than the viewport — otherwise
          phones would stack sections even though the card is scaled desktop. */}
      <div ref={wrapRef} className="w-full">
        <div
          className="@container receipt-scale-card receipt-print-area money-receipt mx-auto bg-white text-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 print:shadow-none print:rounded-none print:border-0"
          style={{ width: RECEIPT_DESIGN_WIDTH, zoom }}
        >
        {/* Accent strip */}
        <div className={`h-2 ${isDeposit ? "bg-emerald-500" : "bg-rose-500"}`} />

        {/* Header band — org branding */}
        <div className="px-8 pt-7 pb-5 flex items-start justify-between gap-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            {org.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo} alt={org.name} className="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-200" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl">
                {org.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{org.name}</h1>
              {org.tagline && <p className="text-xs text-slate-500 italic">{org.tagline}</p>}
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                {addressLine && (
                  <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {addressLine}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {org.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{org.phone}</span>}
                  {org.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{org.email}</span>}
                  {org.website && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{org.website}</span>}
                </div>
                {(org.regNo || org.licenseNo) && (
                  <p className="flex items-center gap-1">
                    <Scale className="h-3 w-3" />
                    {org.regNo && `Reg: ${org.regNo}`}
                    {org.regNo && org.licenseNo && " · "}
                    {org.licenseNo && `Lic: ${org.licenseNo}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Document title */}
          <div className="text-right shrink-0">
            <div className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold tracking-widest text-white ${isDeposit ? "bg-emerald-500" : "bg-rose-500"}`}>
              {txn.transactionType}
            </div>
            <h2 className={`mt-2 text-2xl font-extrabold tracking-tight ${isDeposit ? "text-emerald-700" : "text-rose-700"}`}>{title}</h2>
          </div>
        </div>

        {/* Transaction meta row */}
        <div className="px-8 py-4 grid grid-cols-2 gap-6 border-b border-slate-200 bg-slate-50/50">
          <div className="space-y-1 text-sm">
            <Meta label="Voucher No" value={txn.voucherNo} mono />
            <Meta label="Voucher Type" value={journalEntry?.voucherType ?? "—"} />
            <Meta label="Transaction Date" value={formatDate(txn.transactionDate)} />
            <Meta label="Approved Date" value={txn.approvedAt ? formatDate(txn.approvedAt) : "—"} />
          </div>
          <div className="space-y-1 text-sm">
            <Meta
              label={methodLabel}
              value={txn.paymentMethod ? PAYMENT_METHOD_LABELS[txn.paymentMethod] : "—"}
            />
            <Meta label="Reference No" value={txn.referenceNo ?? "—"} />
            <Meta label="Cash / Bank Account" value={cashAccount ? `${cashAccount.accountName} (${cashAccount.accountCode})` : "—"} />
            {txn.approvedBy && <Meta label="Approved By" value={txn.approvedBy} />}
          </div>
        </div>

        {/* Payee/Payer + amount block */}
        <div className="px-8 py-5 grid grid-cols-1 @md:grid-cols-2 gap-6 items-start">
          {/* Member */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">
              {isDeposit ? "Received with thanks from" : "Paid to"}
            </p>
            <div className="flex items-center gap-3 mt-2">
              {member ? (
                member.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.photoUrl} alt={member.fullName} className="w-14 h-14 rounded-xl object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold ${AVATAR_COLORS[member.gender ?? "OTHER"] ?? AVATAR_COLORS.OTHER}`}>
                    {memberInitials}
                  </div>
                )
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-100" />
              )}
              <div>
                <p className="font-semibold text-slate-900">{member?.fullName ?? "—"}</p>
                <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                  <Hash className="h-3 w-3" /> {member?.memberNo ?? "—"}
                </p>
                {member?.phone && <p className="text-xs text-slate-500">{member.phone}</p>}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Purpose:</span> {purposeLabel}
            </p>
          </div>

          {/* Amount */}
          <div className={`rounded-xl border-2 p-4 ${isDeposit ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50"}`}>
            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
              {isDeposit ? "Amount Received" : "Amount Paid"}
            </p>
            <p className={`text-3xl font-extrabold tracking-tight mt-1 ${isDeposit ? "text-emerald-700" : "text-rose-700"}`}>
              {formatBDT(txn.amount)}
            </p>
            <p className="mt-1 text-xs italic text-slate-600 capitalize">
              In words: {amountInWordsBDT(txn.amount).toLowerCase()}
            </p>
            {/* Total Balance after this transaction — matches the PDF layout. */}
            {txn.balanceAfterTxn !== null && (
              <div className="mt-3 pt-3 border-t border-slate-200/70">
                <p className="text-[10px] uppercase tracking-widest text-indigo-500 font-bold">
                  Total Balance (after this transaction)
                </p>
                <p className="text-lg font-extrabold tracking-tight text-indigo-700 mt-0.5">
                  {formatBDT(txn.balanceAfterTxn)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Active bank accounts — only on deposit receipts (the "future deposit" reference) */}
        {isDeposit && bankAccounts.length > 0 && (
          <div className="px-8 pb-5">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              <p className="text-[11px] uppercase tracking-widest text-indigo-600 font-bold mb-2 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> For Future Deposits — Use Any of the Following Accounts
              </p>
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-2">
                {bankAccounts.map((b) => {
                  const GroupIcon = METHOD_GROUP_ICON[groupForMethod(b.paymentMethod)]
                  return (
                    <div key={b.id} className="flex items-start gap-2 rounded-lg bg-white border border-slate-200 p-2.5 text-xs">
                      <div className="w-7 h-7 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <GroupIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-800 truncate">{b.accountName}</p>
                          {b.isDefault && <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-slate-500">{PAYMENT_METHOD_LABELS[b.paymentMethod]}{b.bankName ? ` · ${b.bankName}` : ""}</p>
                        {b.accountNumber && (
                          <p className="text-slate-500 font-mono">
                            {b.accountNumber}{b.branch ? ` · ${b.branch}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Remarks */}
        {txn.remarks && (
          <div className="px-8 pb-4 text-xs text-slate-600">
            <span className="font-medium text-slate-700">Remarks:</span> {txn.remarks}
          </div>
        )}

        {/* Signature block */}
        <div className="px-8 pb-8 pt-2">
          <div className="signature-row grid grid-cols-3 gap-6 mt-8">
            {(["Received By", "Authorized By", "Member Signature"] as const).map((label) => (
              <div key={label} className="text-center">
                <div className="border-t border-slate-400 pt-1" />
                <p className="text-xs text-slate-600 mt-1">{label}</p>
                <p className="text-[10px] text-slate-400">Date: __________</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-200 bg-slate-50 text-center text-[11px] text-slate-500">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {org.website && (
              <a href={org.website} className="flex items-center gap-1 hover:text-indigo-600">
                <Globe className="h-3 w-3" /> {org.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            {org.facebook && <span>Facebook</span>}
            {org.whatsapp && <span>WhatsApp</span>}
            {org.youtube && <span>YouTube</span>}
          </div>
          <p className="mt-1.5">
            This is a computer-generated voucher · Voucher No <span className="font-mono">{txn.voucherNo}</span> · Generated on {formatDate(new Date().toISOString())}
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}

// ─── Small helper component ─────────────────────────────────────────────
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium w-32 shrink-0">{label}</span>
      <span className={`text-slate-800 ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  )
}
