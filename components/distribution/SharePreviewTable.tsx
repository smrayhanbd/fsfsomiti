"use client"

// Read-only table showing each eligible member's fund at the snapshot date,
// their computed share %, and the amount they will receive. Used inside the
// DistributionBuilder preview and on the distribution detail page.

import { formatBDT } from "@/components/somiti/Money"

export interface ShareRow {
  memberNo: string
  memberName: string
  fundAtSnapshot: number
  weight: number // 0–1
  amount: number
}

interface Props {
  rows: ShareRow[]
  /** When set, show the "Dust" badge on the member who absorbed rounding. */
  totalDistributable: number
  /** Collapsed/compact mode for embedding in detail pages. */
  compact?: boolean
}

export default function SharePreviewTable({ rows, totalDistributable, compact }: Props) {
  const totalFund = rows.reduce((s, r) => s + r.fundAtSnapshot, 0)
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-subtle/60">
            <th className="t-overline px-3 py-2 text-left text-muted-ink">Member</th>
            <th className="t-overline px-3 py-2 text-left text-muted-ink">Name</th>
            <th className="t-overline px-3 py-2 text-right text-muted-ink">Fund @ Snapshot</th>
            <th className="t-overline px-3 py-2 text-right text-muted-ink">Share %</th>
            <th className="t-overline px-3 py-2 text-right text-muted-ink">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.memberNo + i} className="border-t border-[var(--border-base)]">
              <td className="t-caption px-3 py-2 text-secondary-ink">{r.memberNo}</td>
              <td className="t-caption px-3 py-2 text-secondary-ink">{r.memberName}</td>
              <td className="t-num px-3 py-2 text-right">{formatBDT(r.fundAtSnapshot)}</td>
              <td className="t-num px-3 py-2 text-right text-muted-ink">
                {(r.weight * 100).toFixed(2)}%
              </td>
              <td className="t-num px-3 py-2 text-right font-semibold text-brand">
                {formatBDT(r.amount)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="t-caption px-3 py-4 text-center text-muted-ink">
                No eligible members.
              </td>
            </tr>
          )}
        </tbody>
        {!compact && (
          <tfoot>
            <tr className="border-t-2 border-[var(--border-strong)] bg-subtle/40">
              <td className="t-caption px-3 py-2 font-bold text-primary-ink" colSpan={2}>
                Total ({rows.length} members)
              </td>
              <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalFund)}</td>
              <td className="t-num px-3 py-2 text-right font-bold">100.00%</td>
              <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalAmount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {Math.abs(totalAmount - totalDistributable) > 0.005 && (
        <div className="border-t border-[var(--border-base)] bg-debit/5 px-3 py-1.5 text-right t-caption text-debit">
          Out of balance by {(totalAmount - totalDistributable).toFixed(2)} — adjust before posting.
        </div>
      )}
    </div>
  )
}
