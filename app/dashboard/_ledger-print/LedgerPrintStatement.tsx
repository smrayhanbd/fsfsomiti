import type { ReactNode } from "react"
import type { OrgInfo } from "@/lib/organization"

/**
 * Shared printable ledger statement — used by both the Member Ledger and the
 * Account Ledger.
 *
 * The component is hidden on screen (`.ledger-print-area { display: none }`) and
 * revealed only inside `@media print`, where the print CSS in `globals.css`
 * isolates it (via `visibility`) so `window.print()` emits exactly this block —
 * the admin chrome, filter bars, and stat cards are dropped.
 *
 * Layout mirrors the reference PDF: org header band on the left, the entity
 * identity (member OR COA account) on the right, a centered "LEDGER STATEMENT"
 * title, the running-balance table, and a footer with period totals, opening
 * balance, and available balance.
 *
 * Both callers pass already-computed running-balance rows + opening/totals, so
 * this component is pure presentation (no business logic).
 */

export type LedgerEntity =
  | {
      kind: "MEMBER"
      /** e.g. "MD RAYHAN SARDER (M0001)" */
      name: string
      phone?: string | null
      email?: string | null
      /** Single-line address, or null */
      address?: string | null
    }
  | {
      kind: "ACCOUNT"
      /** The COA account name — shown in the left entity block per request. */
      name: string
      /** Account code (e.g. "1010") */
      code?: string | null
      /** Account type label (e.g. "Asset") */
      type?: string | null
    }

export interface LedgerPrintColumn {
  key: string
  label: string
  align?: "left" | "right"
}

export interface LedgerPrintRow {
  [key: string]: ReactNode
}

interface Props {
  org: OrgInfo
  entity: LedgerEntity
  /** "01-07-2025 to 30-06-2026" */
  period: string
  columns: LedgerPrintColumn[]
  /** Opening balance row (rendered first, italic). */
  openingCells: ReactNode[]
  rows: LedgerPrintRow[]
  /** Final/closing row cells (rendered bold at the bottom). */
  closingCells: ReactNode[]
  /** Footer summary lines — each rendered on its own line. */
  footerLines: string[]
}

export default function LedgerPrintStatement({
  org,
  entity,
  period,
  columns,
  openingCells,
  rows,
  closingCells,
  footerLines,
}: Props) {
  const orgAddress = [
    org.addressLine,
    org.city,
    org.district,
    org.postalCode,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="ledger-print-area">
      <div
        className="ledger-statement"
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "24px",
          color: "#111",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          fontSize: "12px",
        }}
      >
        {/* ── Header band ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "24px",
            borderBottom: "2px solid #111",
            paddingBottom: "12px",
            marginBottom: "16px",
          }}
        >
          {/* Left — org branding */}
          <div style={{ flex: "1 1 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {org.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={org.logo}
                  alt={org.name}
                  style={{ width: "48px", height: "48px", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    background: "#4f46e5",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "20px",
                  }}
                >
                  {org.name.charAt(0)}
                </div>
              )}
              <div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#111" }}>
                  {org.name}
                </div>
                {org.tagline && (
                  <div style={{ fontSize: "11px", color: "#555", fontStyle: "italic" }}>
                    {org.tagline}
                  </div>
                )}
              </div>
            </div>
            {orgAddress && (
              <div style={{ marginTop: "6px", fontSize: "11px", color: "#555", maxWidth: "320px" }}>
                {orgAddress}
              </div>
            )}
          </div>

          {/* Right — entity identity block */}
          <div style={{ flex: "0 0 280px", textAlign: "left", fontSize: "11px", color: "#111" }}>
            {entity.kind === "MEMBER" ? (
              <>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>{entity.name}</div>
                {entity.phone && <div>Phone : {entity.phone}</div>}
                {entity.email && <div>Email : {entity.email}</div>}
                {entity.address && <div>Address : {entity.address}</div>}
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>{entity.name}</div>
                {entity.code && <div>Code : {entity.code}</div>}
                {entity.type && <div>Type : {entity.type}</div>}
              </>
            )}
            <div style={{ marginTop: "4px" }}>Period : {period}</div>
          </div>
        </div>

        {/* ── Centered title ──────────────────────────────────────────── */}
        <div
          style={{
            textAlign: "center",
            fontSize: "15px",
            fontWeight: 800,
            letterSpacing: "1px",
            margin: "10px 0 14px",
          }}
        >
          LEDGER STATEMENT
        </div>

        {/* ── Running-balance table ──────────────────────────────────── */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: c.align === "right" ? "right" : "left",
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                        background: "#f5f5f5",
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Opening row */}
            <tr>
              {openingCells.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    padding: "6px 8px",
                    fontStyle: "italic",
                    color: "#555",
                    textAlign: columns[i]?.align === "right" ? "right" : "left",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>

            {/* Movement rows */}
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    style={{
                      padding: "6px 8px",
                      textAlign: c.align === "right" ? "right" : "left",
                    }}
                  >
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}

            {/* Closing row */}
            <tr>
              {closingCells.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    padding: "6px 8px",
                    fontWeight: 700,
                    textAlign: columns[i]?.align === "right" ? "right" : "left",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── Footer summary ──────────────────────────────────────────── */}
        <div style={{ marginTop: "14px", fontSize: "11px", color: "#111" }}>
          {footerLines.map((line, i) => (
            <div key={i} style={{ fontWeight: i === footerLines.length - 1 ? 700 : 400 }}>
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "18px",
            borderTop: "1px dashed #bbb",
            paddingTop: "8px",
            textAlign: "center",
            fontSize: "10px",
            color: "#777",
          }}
        >
          -------------------------------------------------- End of Statement
          --------------------------------------------------
          <div style={{ marginTop: "4px" }}>
            This is a computer generated statement and requires no signature
          </div>
        </div>
      </div>
    </div>
  )
}
