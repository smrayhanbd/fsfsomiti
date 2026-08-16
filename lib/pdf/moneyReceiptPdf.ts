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
import type { ReceiptPayload } from "@/lib/pdf/receipt-payload"

/** Instance type of a pdfkit document, taken from the typed `"pdfkit"` module. */
type PDFDocument = InstanceType<typeof import("pdfkit")>
const PDFDocument = PDFDocumentConstructor as unknown as new (
  options?: Record<string, unknown>
) => PDFDocument
import { PAYMENT_METHOD_LABELS } from "@/lib/transactions/types"
import { amountInWordsBDT } from "@/lib/format"

/**
 * Server-side money-receipt PDF generator.
 *
 * Produces a self-contained PDF Buffer that mirrors the on-screen
 * `MoneyReceipt` component so the emailed attachment matches what an admin
 * sees in the dashboard. Used to attach a money receipt to the approval email
 * (see `app/actions/transactions.ts` → `notifyMember`).
 *
 * Per the current spec there is NO accounting debit/credit table on the
 * receipt, and the channel label reads "COLLECTION METHOD" when the voucher
 * type is RECEIPT (money collected from the member) and "PAYMENT METHOD"
 * otherwise.
 *
 * Pure drawing — takes a payload, returns a Buffer. No DB or network access,
 * so it is cheap to call and easy to reason about. Server-only (pdfkit is a
 * Node library).
 */

// A4 portrait at 72 DPI (pdfkit default units are PDF points = 1/72 inch).
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48 // ~17mm

const INK = "#111827"
const MUTED = "#6b7280"
const LINE = "#d1d5db"
const DEPOSIT_ACCENT = "#059669"
const WITHDRAWAL_ACCENT = "#e11d48"

const PAYMENT_METHOD_GROUP: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "Mobile (bKash)",
  NAGAD: "Mobile (Nagad)",
  ROCKET: "Mobile (Rocket)",
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

function fmtBDT(n: number): string {
  // NOTE: pdfkit's core Helvetica font only supports Latin-1, so the Bengali
  // Rupee Mark (৳, U+09F3) renders as a blank/missing glyph. Use the ASCII
  // text "BDT" prefix instead — matches the on-screen voucher's "formatBDT"
  // intent without requiring a Unicode font registration.
  return `BDT ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function generateMoneyReceiptPdf(
  payload: ReceiptPayload
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title: `Money Receipt — ${payload.txn.voucherNo}`,
          Author: payload.org.name,
        },
      })

      const chunks: Buffer[] = []
      doc.on("data", (c: Buffer) => chunks.push(c))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      const { org, txn, member, cashAccount, bankAccounts } = payload
      const isDeposit = txn.transactionType === "DEPOSIT"
      const isReceipt = txn.voucherType === "RECEIPT"
      const accent = isDeposit ? DEPOSIT_ACCENT : WITHDRAWAL_ACCENT
      const title = isDeposit ? "MONEY RECEIPT" : "WITHDRAWAL VOUCHER"
      const contentWidth = PAGE_WIDTH - MARGIN * 2

      // ── Accent strip ────────────────────────────────────────────────
      doc.rect(0, 0, PAGE_WIDTH, 6).fill(accent)

      let y = MARGIN + 6

      // ── Header band ─────────────────────────────────────────────────
      // Org name + tagline (left), document title (right).
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(org.name, MARGIN, y, { width: contentWidth * 0.6 })

      if (org.tagline) {
        doc
          .fillColor(MUTED)
          .font("Helvetica-Oblique")
          .fontSize(9)
          .text(org.tagline, MARGIN, y + 20, { width: contentWidth * 0.6 })
      }

      const addressLine = [org.addressLine, org.city, org.district, org.postalCode]
        .filter(Boolean)
        .join(", ")
      const contactBits: string[] = []
      if (org.phone) contactBits.push(`Phone: ${org.phone}`)
      if (org.email) contactBits.push(`Email: ${org.email}`)
      const headerSub = [addressLine, contactBits.join("  ·  ")]
        .filter(Boolean)
        .join("\n")
      if (headerSub) {
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(8)
          .text(headerSub, MARGIN, y + (org.tagline ? 34 : 20), {
            width: contentWidth * 0.6,
            lineGap: 1,
          })
      }

      // Title (right-aligned block).
      doc
        .fillColor(accent)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(txn.transactionType, MARGIN + contentWidth * 0.6, y, {
          width: contentWidth * 0.4,
          align: "right",
        })
      doc
        .fillColor(accent)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(title, MARGIN + contentWidth * 0.6, y + 12, {
          width: contentWidth * 0.4,
          align: "right",
        })

      y = Math.max(y + (org.tagline ? 60 : 46), doc.y) + 6
      doc
        .strokeColor(LINE)
        .lineWidth(1)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke()
      y += 12

      // ── Meta row (two columns) ──────────────────────────────────────
      const colW = contentWidth / 2 - 6
      const metaLeft: [string, string][] = [
        ["Voucher No", txn.voucherNo],
        ["Voucher Type", txn.voucherType],
        ["Transaction Date", fmtDate(txn.transactionDate)],
        ["Approved Date", fmtDate(txn.approvedAt)],
      ]
      const methodLabel = isReceipt ? "Collection Method" : "Payment Method"
      const metaRight: [string, string][] = [
        [
          methodLabel,
          txn.paymentMethod
            ? PAYMENT_METHOD_LABELS[txn.paymentMethod] ??
              PAYMENT_METHOD_GROUP[txn.paymentMethod] ??
              txn.paymentMethod
            : "—",
        ],
        ["Reference No", txn.referenceNo ?? "—"],
        [
          "Cash / Bank Account",
          cashAccount ? `${cashAccount.accountName} (${cashAccount.accountCode})` : "—",
        ],
      ]
      if (txn.approvedBy) metaRight.push(["Approved By", txn.approvedBy])

      const metaTop = y
      let leftY = metaTop
      let rightY = metaTop
      for (const [k, v] of metaLeft) {
        leftY = drawMeta(doc, k, v, MARGIN, leftY, colW)
      }
      for (const [k, v] of metaRight) {
        rightY = drawMeta(doc, k, v, MARGIN + colW + 12, rightY, colW)
      }
      y = Math.max(leftY, rightY) + 8

      doc
        .strokeColor(LINE)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke()
      y += 16

      // ── Payee / amount block ────────────────────────────────────────
      doc
        .fillColor(MUTED)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(isDeposit ? "RECEIVED WITH THANKS FROM" : "PAID TO", MARGIN, y, {
          width: colW,
        })
      y += 14
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(member?.fullName ?? "—", MARGIN, y, { width: colW })
      y += 16
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(9)
        .text(`Member No: ${member?.memberNo ?? "—"}`, MARGIN, y, { width: colW })
      if (member?.phone) {
        y += 12
        doc.text(`Phone: ${member.phone}`, MARGIN, y, { width: colW })
      }
      y += 12
      doc.text(`Purpose: ${txn.purpose}`, MARGIN, y, { width: colW })

      // Amount block (right).
      const amtY = y - 14
      doc
        .fillColor("#ffffff")
        .rect(MARGIN + colW + 12, amtY, colW, 78)
        .fill(isDeposit ? "#ecfdf5" : "#fff1f2")
      doc
        .strokeColor(isDeposit ? "#a7f3d0" : "#fecdd3")
        .lineWidth(1.5)
        .rect(MARGIN + colW + 12, amtY, colW, 78)
        .stroke()
      doc
        .fillColor(MUTED)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(isDeposit ? "AMOUNT RECEIVED" : "AMOUNT PAID", MARGIN + colW + 24, amtY + 10, {
          width: colW - 24,
        })
      doc
        .fillColor(accent)
        .font("Helvetica-Bold")
        .fontSize(26)
        .text(fmtBDT(txn.amount), MARGIN + colW + 24, amtY + 22, {
          width: colW - 24,
        })
      doc
        .fillColor(INK)
        .font("Helvetica-Oblique")
        .fontSize(8)
        .text(
          `In words: ${amountInWordsBDT(txn.amount).toLowerCase()}`,
          MARGIN + colW + 24,
          amtY + 56,
          { width: colW - 24 }
        )

      // ── Total Balance (member's savings balance after this transaction).
      // Rendered as a slim accent strip below the amount box so the member
      // sees their accumulated savings right on the voucher. Skipped when
      // `balanceAfterTxn` is null (no linked member).
      if (txn.balanceAfterTxn !== null) {
        const balY = amtY + 78 + 8
        doc
          .fillColor("#eef2ff")
          .rect(MARGIN + colW + 12, balY, colW, 30)
          .fill()
        doc
          .strokeColor("#c7d2fe")
          .lineWidth(1)
          .rect(MARGIN + colW + 12, balY, colW, 30)
          .stroke()
        doc
          .fillColor(MUTED)
          .font("Helvetica-Bold")
          .fontSize(7)
          .text("TOTAL BALANCE (AFTER THIS TRANSACTION)", MARGIN + colW + 24, balY + 6, {
            width: colW - 24,
          })
        doc
          .fillColor("#4338ca")
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(fmtBDT(txn.balanceAfterTxn), MARGIN + colW + 24, balY + 15, {
            width: colW - 24,
          })
      }

      y = amtY + 78 + (txn.balanceAfterTxn !== null ? 38 : 0) + 18

      // ── Remarks ─────────────────────────────────────────────────────
      if (txn.remarks) {
        doc
          .fillColor(MUTED)
          .font("Helvetica-Bold")
          .fontSize(8)
          .text("REMARKS", MARGIN, y, { width: contentWidth })
        y += 12
        doc
          .fillColor(INK)
          .font("Helvetica")
          .fontSize(9)
          .text(txn.remarks, MARGIN, y, { width: contentWidth })
        y = doc.y + 14
      }

      // ── Bank accounts (deposits only) ───────────────────────────────
      if (isDeposit && bankAccounts.length > 0) {
        ensureSpace(doc, 80)
        if (doc.y + 80 > PAGE_HEIGHT - MARGIN - 120) {
          doc.addPage()
          y = MARGIN
        } else {
          y = Math.max(y, doc.y)
        }

        doc
          .fillColor("#e0e7ff")
          .rect(MARGIN, y, contentWidth, 24)
          .fill()
        doc
          .fillColor("#4338ca")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text(
            "FOR FUTURE DEPOSITS — USE ANY OF THE FOLLOWING ACCOUNTS",
            MARGIN + 8,
            y + 8,
            { width: contentWidth - 16 }
          )
        y += 30

        const half = contentWidth / 2 - 6
        bankAccounts.slice(0, 6).forEach((b, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const bx = MARGIN + col * (half + 12)
          const by = y + row * 38
          doc
            .strokeColor(LINE)
            .lineWidth(1)
            .rect(bx, by, half, 34)
            .stroke()
          doc
            .fillColor(INK)
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(
              `${b.accountName}${b.isDefault ? "  ★" : ""}`,
              bx + 6,
              by + 5,
              { width: half - 12 }
            )
          doc
            .fillColor(MUTED)
            .font("Helvetica")
            .fontSize(7)
            .text(
              `${
                PAYMENT_METHOD_LABELS[b.paymentMethod] ?? b.paymentMethod
              }${b.bankName ? ` · ${b.bankName}` : ""}`,
              bx + 6,
              by + 17,
              { width: half - 12 }
            )
          if (b.accountNumber) {
            doc.text(
              `${b.accountNumber}${b.branch ? ` · ${b.branch}` : ""}`,
              bx + 6,
              by + 26,
              { width: half - 12 }
            )
          }
        })
        const rows = Math.ceil(Math.min(bankAccounts.length, 6) / 2)
        y = y + rows * 38 + 10
      }

      // ── Signature row ───────────────────────────────────────────────
      ensureSpace(doc, 60)
      y = Math.max(y, doc.y) + 30
      const sigW = contentWidth / 3 - 8
      const labels = ["Received By", "Authorized By", "Member Signature"]
      labels.forEach((label, i) => {
        const sx = MARGIN + i * (sigW + 12)
        doc
          .strokeColor(INK)
          .lineWidth(1)
          .moveTo(sx, y)
          .lineTo(sx + sigW, y)
          .stroke()
        doc
          .fillColor(INK)
          .font("Helvetica")
          .fontSize(8)
          .text(label, sx, y + 3, { width: sigW, align: "center" })
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(7)
          .text("Date: __________", sx, y + 14, { width: sigW, align: "center" })
      })

      // ── Footer ──────────────────────────────────────────────────────
      doc
        .strokeColor(LINE)
        .moveTo(MARGIN, PAGE_HEIGHT - MARGIN - 28)
        .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 28)
        .stroke()
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(7)
        .text(
          `This is a computer-generated voucher · Voucher No ${txn.voucherNo} · Generated on ${fmtDate(
            new Date().toISOString()
          )}`,
          MARGIN,
          PAGE_HEIGHT - MARGIN - 22,
          { width: contentWidth, align: "center" }
        )

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

// ── Drawing helpers ─────────────────────────────────────────────────────
function drawMeta(
  doc: PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
): number {
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x, y, {
    width: 70,
  })
  doc.fillColor(INK).font("Helvetica").fontSize(9).text(value, x + 74, y - 1, {
    width: width - 74,
  })
  return y + 16
}

function ensureSpace(doc: PDFDocument, needed: number) {
  if (doc.y + needed > PAGE_HEIGHT - MARGIN) {
    doc.addPage()
  }
}
