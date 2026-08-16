// Deep-import the CommonJS entry (`pdfkit/js/pdfkit.js`) rather than the
// package root. The root resolves to the ESM build (`pdfkit.es.js`) under
// Turbopack, whose `fontkit` dependency is compiled against an `@swc/helpers`
// export that no longer exists — that breaks the Next.js build. The CJS entry
// has no such transpilation layer and loads cleanly in a Node/server context.
//
// The deep CJS path ships no .d.ts, so the constructor is imported untyped and
// cast to the @types/pdfkit constructor shape. The document instance type is
// derived from the typed `"pdfkit"` module via InstanceType.
 
// @ts-expect-error — no type declarations for the deep CJS path.
import PDFDocumentConstructor from "pdfkit/js/pdfkit.js"
import type { OrgInfo } from "@/lib/organization"

/** Instance type of a pdfkit document, taken from the typed `"pdfkit"` module. */
type PDFDocument = InstanceType<typeof import("pdfkit")>
const PDFDocument = PDFDocumentConstructor as unknown as new (
  options?: Record<string, unknown>
) => PDFDocument

/**
 * Server-side ledger-statement PDF generator (member portal).
 *
 * Produces a self-contained PDF Buffer that EXACTLY mirrors the on-screen
 * printable `LedgerPrintStatement` component used by the admin member-ledger
 * page — so a member's downloaded PDF is identical to what an admin would
 * print from the dashboard.
 *
 * Layout (matching admin):
 *   - Header band: org branding (left) + member identity block (right)
 *   - Centered "LEDGER STATEMENT" title
 *   - 8-column running-balance table:
 *       Date | Description | Receipt/Voucher | Type | Method |
 *       Withdrawal | Deposit | Balance
 *   - Opening row (italic, muted)
 *   - Movement rows
 *   - Closing row (bold, "Period totals")
 *   - Footer summary lines (totals, opening, closing)
 *   - "End of Statement" dashed footer
 *
 * Pure drawing — takes a payload, returns a Buffer. No DB or network access.
 * Server-only (pdfkit is a Node library).
 */

// A4 portrait at 72 DPI (pdfkit default units are PDF points = 1/72 inch).
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 40 // slightly tighter than money-receipt to fit 8 columns

const INK = "#111111"
const MUTED = "#555555"
const FAINT = "#777777"
const LINE = "#dddddd"
const HEAD_BG = "#f5f5f5"
const OPENING_TINT = "#fafafa"

/**
 * A single movement row on the ledger — already serialised to plain values.
 *
 * The column order matches the admin's `printColumns`:
 *   Date | Description | Receipt/Voucher | Type | Method |
 *   Withdrawal | Deposit | Balance
 */
export interface LedgerStatementRow {
  /** ISO date string — formatted as dd Mmm yyyy on the PDF. */
  date: string
  /** Free-text description (remarks + reference). May be empty. */
  description: string
  /** Receipt number from the savings row, or voucher number from the GL mirror. */
  ref: string
  /** Human-readable label for the row type (collection-type name, etc.). */
  typeLabel: string
  /** Payment method label (humanized). */
  method: string
  /** Debit amount (withdrawals). 0 for credit rows. */
  debit: number
  /** Credit amount (deposits, etc.). 0 for debit rows. */
  credit: number
  /** Running balance at this row (already computed by the caller). */
  balance: number
}

export interface LedgerStatementPayload {
  org: OrgInfo
  member: {
    memberNo: string
    fullName: string
    phone: string | null
    email: string | null
    /** Single-line address, or null. */
    address: string | null
    /** Membership start date ISO, or null. */
    membershipDate: string | null
  }
  /** "01 Jul 2025 to 30 Jun 2026" style period label. */
  period: string
  /** Opening balance at the start of the window (already computed). */
  openingBalance: number
  /** All-time totals (independent of the window) — shown in the footer. */
  totalDepositsAllTime: number
  totalWithdrawalsAllTime: number
  /** Movement rows within the window, oldest-first. */
  rows: LedgerStatementRow[]
  /** Sum of debits within the window. */
  totalDebit: number
  /** Sum of credits within the window. */
  totalCredit: number
  /** Closing balance = openingBalance + totalCredit − totalDebit. */
  closingBalance: number
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/**
 * Format a number as a plain grouped string (no currency symbol).
 * Mirrors `formatNumber()` from lib/accounting.ts used by the admin's
 * LedgerPrintStatement footer lines ("12,345.00" etc.).
 */
function fmtNum(n: number): string {
  const sign = n < 0 ? "-" : ""
  return `${sign}${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Format a number with a "BDT" prefix for the on-screen-style footer lines.
 * Uses ASCII "BDT" (not the ৳ Bengali Rupee Mark) because pdfkit's core
 * Helvetica font only supports Latin-1.
 */
function fmtBDT(n: number): string {
  return `BDT ${fmtNum(n)}`
}

export async function generateLedgerStatementPdf(
  payload: LedgerStatementPayload
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: `Ledger Statement — ${payload.member.memberNo}`,
          Author: payload.org.name,
        },
      })

      const chunks: Buffer[] = []
      doc.on("data", (c: Buffer) => chunks.push(c))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      const { org, member, period, openingBalance, rows, totalDebit, totalCredit, closingBalance } = payload
      const contentWidth = PAGE_WIDTH - MARGIN * 2

      let y = MARGIN

      // ── Header band ─────────────────────────────────────────────────
      // Two-column flex: org branding (left, flex-grow) + member identity
      // block (right, fixed 280pt). Matches the admin component's layout.
      const leftW = contentWidth - 280 - 24 // 24pt gap
      const rightX = MARGIN + leftW + 24
      const rightW = 280

      // Left — org branding.
      doc.font("Helvetica-Bold").fontSize(16).fillColor(INK)
      doc.text(org.name, MARGIN, y, { width: leftW })

      if (org.tagline) {
        doc.font("Helvetica-Oblique").fontSize(11).fillColor(MUTED)
        doc.text(org.tagline, MARGIN, y + 20, { width: leftW })
      }

      const orgAddress = [org.addressLine, org.city, org.district, org.postalCode]
        .filter(Boolean)
        .join(", ")
      if (orgAddress) {
        doc.font("Helvetica").fontSize(11).fillColor(MUTED)
        doc.text(orgAddress, MARGIN, y + (org.tagline ? 40 : 22), {
          width: Math.min(leftW, 320),
        })
      }

      // Right — member identity block.
      const memName = `${member.fullName}  (${member.memberNo})`
      doc.font("Helvetica-Bold").fontSize(13).fillColor(INK)
      doc.text(memName, rightX, y, { width: rightW })

      let memY = y + 16
      doc.font("Helvetica").fontSize(11).fillColor(INK)
      if (member.phone) {
        doc.text(`Phone : ${member.phone}`, rightX, memY, { width: rightW })
        memY += 13
      }
      if (member.email) {
        doc.text(`Email : ${member.email}`, rightX, memY, { width: rightW })
        memY += 13
      }
      if (member.address) {
        doc.text(`Address : ${member.address}`, rightX, memY, { width: rightW })
        memY += 13
      }
      doc.text(`Period : ${period}`, rightX, memY, { width: rightW })

      // Advance y past whichever column is taller, then draw the separator.
      const leftBottom = y + (org.tagline ? (orgAddress ? 58 : 42) : (orgAddress ? 40 : 22))
      const rightBottom = memY + 13
      y = Math.max(leftBottom, rightBottom) + 8

      doc
        .strokeColor(INK)
        .lineWidth(2)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke()
      y += 16

      // ── Centered "LEDGER STATEMENT" title ───────────────────────────
      doc.font("Helvetica-Bold").fontSize(15).fillColor(INK)
      doc.text("LEDGER STATEMENT", MARGIN, y, {
        width: contentWidth,
        align: "center",
      })
      y += 24

      // ── Running-balance table ───────────────────────────────────────
      // 8 columns matching admin's printColumns:
      //   Date | Description | Receipt/Voucher | Type | Method |
      //   Withdrawal | Deposit | Balance
      //
      // Widths are in PDF points, scaled to fit contentWidth exactly.
      const colSpecs = [
        { key: "date", label: "Date", align: "left" as const, w: 58 },
        { key: "description", label: "Description", align: "left" as const, w: 120 },
        { key: "ref", label: "Receipt / Voucher", align: "left" as const, w: 80 },
        { key: "typeLabel", label: "Type", align: "left" as const, w: 70 },
        { key: "method", label: "Method", align: "left" as const, w: 60 },
        { key: "debit", label: "Withdrawal", align: "right" as const, w: 70 },
        { key: "credit", label: "Deposit", align: "right" as const, w: 70 },
        { key: "balance", label: "Balance", align: "right" as const, w: 70 },
      ]
      // Scale column widths to fit contentWidth exactly.
      const totalColW = colSpecs.reduce((s, c) => s + c.w, 0)
      const scale = contentWidth / totalColW
      const cols = colSpecs.map((c) => ({ ...c, w: Math.round(c.w * scale) }))

      // Header row.
      const headerH = 22
      doc
        .fillColor(HEAD_BG)
        .rect(MARGIN, y, contentWidth, headerH)
        .fill()
      let cx = MARGIN
      cols.forEach((c) => {
        doc
          .fillColor(INK)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(c.label, cx + 8, y + 6, {
            width: c.w - 16,
            align: c.align === "right" ? "right" : "left",
          })
        cx += c.w
      })
      doc
        .strokeColor(LINE)
        .lineWidth(0.5)
        .rect(MARGIN, y, contentWidth, headerH)
        .stroke()
      y += headerH

      // Helper: draw a single row of cells with a given style.
      // Returns the row height used (so the caller can advance y).
      const drawRow = (
        cells: string[],
        style: {
          font?: string
          fontSize?: number
          color?: string
          italic?: boolean
          bold?: boolean
          tint?: string
        } = {}
      ): number => {
        const {
          font = "Helvetica",
          fontSize = 11,
          color = INK,
          italic = false,
          bold = false,
          tint,
        } = style

        // Use the description column's width to measure the wrapped height.
        const descCol = cols[1]
        const descWidth = descCol.w - 16
        const fontFamily = bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : font
        doc.font(fontFamily).fontSize(fontSize)
        const descHeight = doc.heightOfString(cells[1] || "—", {
          width: descWidth,
          lineGap: 1,
        })
        const rowH = Math.max(18, Math.ceil(descHeight) + 8)

        // Page break before drawing if we'd overflow (leave room for the
        // closing row + footer summary + end-of-statement footer).
        if (y + rowH > PAGE_HEIGHT - MARGIN - 80) {
          doc.addPage()
          y = MARGIN
        }

        // Optional zebra/background tint.
        if (tint) {
          doc
            .fillColor(tint)
            .rect(MARGIN, y, contentWidth, rowH)
            .fill()
        }

        cx = MARGIN
        cells.forEach((cell, i) => {
          const c = cols[i]
          doc
            .fillColor(color)
            .font(fontFamily)
            .fontSize(fontSize)
            .text(cell, cx + 8, y + 5, {
              width: c.w - 16,
              align: c.align === "right" ? "right" : "left",
              lineGap: 1,
            })
          cx += c.w
        })

        // Row separator line.
        doc
          .strokeColor(LINE)
          .lineWidth(0.3)
          .moveTo(MARGIN, y + rowH)
          .lineTo(PAGE_WIDTH - MARGIN, y + rowH)
          .stroke()

        return rowH
      }

      // Opening row (italic, muted, with tinted background).
      y += drawRow(
        [
          "—",
          "Opening balance",
          "",
          "",
          "",
          "",
          "",
          fmtNum(openingBalance),
        ],
        { italic: true, color: MUTED, tint: OPENING_TINT }
      )

      // Movement rows.
      rows.forEach((row) => {
        const cells = [
          fmtDate(row.date),
          row.description || "—",
          row.ref || "—",
          row.typeLabel,
          row.method,
          row.debit > 0 ? fmtNum(row.debit) : "",
          row.credit > 0 ? fmtNum(row.credit) : "",
          fmtNum(row.balance),
        ]
        y += drawRow(cells)
      })

      // Closing row (bold, "Period totals"). Matches admin's closingCells.
      if (y + 22 > PAGE_HEIGHT - MARGIN - 80) {
        doc.addPage()
        y = MARGIN
      }
      y += drawRow(
        [
          "Period totals",
          "",
          "",
          "",
          "",
          totalDebit > 0 ? fmtNum(totalDebit) : "",
          totalCredit > 0 ? fmtNum(totalCredit) : "",
          fmtNum(closingBalance),
        ],
        { bold: true }
      )

      // ── Footer summary lines ───────────────────────────────────────
      // Mirrors admin's `footerLines`:
      //   Total Withdrawal : X BDT
      //   Total Deposit : X BDT
      //   Opening Balance : X BDT
      //   Closing Balance as of <date> : X BDT
      y += 10
      if (y + 60 > PAGE_HEIGHT - MARGIN - 30) {
        doc.addPage()
        y = MARGIN
      }

      const footerLines = [
        `Total Withdrawal : ${fmtBDT(totalDebit)}`,
        `Total Deposit : ${fmtBDT(totalCredit)}`,
        `Opening Balance : ${fmtBDT(openingBalance)}`,
        `Closing Balance as of ${fmtDate(payload.period.split(" to ").pop() || new Date().toISOString())} : ${fmtBDT(closingBalance)}`,
      ]
      footerLines.forEach((line, i) => {
        doc
          .fillColor(INK)
          .font(i === footerLines.length - 1 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(11)
          .text(line, MARGIN, y, { width: contentWidth })
        y += 14
      })

      // ── End-of-statement dashed footer ─────────────────────────────
      y += 8
      if (y + 30 > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      doc
        .strokeColor("#bbbbbb")
        .lineWidth(1)
        .dash(2, { space: 2 })
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke()
        .undash()
      y += 8

      doc
        .fillColor(FAINT)
        .font("Helvetica")
        .fontSize(10)
        .text(
          "-------------------------------------------------- End of Statement --------------------------------------------------",
          MARGIN,
          y,
          { width: contentWidth, align: "center" }
        )
      y += 14
      doc
        .fillColor(FAINT)
        .font("Helvetica")
        .fontSize(10)
        .text(
          "This is a computer generated statement and requires no signature",
          MARGIN,
          y,
          { width: contentWidth, align: "center" }
        )

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
