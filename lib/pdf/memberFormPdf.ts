// Deep-import the CommonJS entry (`pdfkit/js/pdfkit.js`) rather than the
// package root. The root resolves to the ESM build (`pdfkit.es.js`) under
// Turbopack, whose `fontkit` dependency is compiled against an `@swc/helpers`
// export that no longer exists — that breaks the Next.js build. The CJS entry
// has no such transpilation layer and loads cleanly in a Node/server context.
//
// The deep CJS path ships no .d.ts, so the constructor is imported untyped and
// cast to the @types/pdfkit constructor shape. The document instance type is
// derived from the typed `"pdfkit"` module via InstanceType.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — no type declarations for the deep CJS path.
import PDFDocumentConstructor from "pdfkit/js/pdfkit.js"
import type { OrgInfo } from "@/lib/organization"

/** Instance type of a pdfkit document, taken from the typed `"pdfkit"` module. */
type PDFDocument = InstanceType<typeof import("pdfkit")>
const PDFDocument = PDFDocumentConstructor as unknown as new (
  options?: Record<string, unknown>
) => PDFDocument

/**
 * Server-side Membership Application Form PDF generator.
 *
 * Produces a self-contained PDF Buffer that mirrors the official printed
 * membership form: org letterhead at the top, member photo + quick info,
 * four numbered sections (Personal / Residence / Banking / Nominee),
 * declaration + signature blocks, authorized signatures row, and the
 * official-seal footer.
 *
 * Pure drawing — takes a payload, returns a Buffer. No DB or network access,
 * so it is cheap to call and easy to reason about. Server-only (pdfkit is a
 * Node library).
 */

// A4 portrait at 72 DPI (pdfkit default units are PDF points = 1/72 inch).
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 36 // ~12.7mm — slightly tighter than the money receipt to fit more content

// Brand palette (mirrors the reference image).
const NAVY = "#0f2c5c"        // primary dark blue — headers, letterhead
const GREEN = "#1f8a4c"       // secondary green — section accents, membership box header
const GOLD = "#c9a227"        // gold — divider lines, "KYC" badge
const INK = "#111827"         // near-black body text
const MUTED = "#6b7280"       // grey labels
const LINE = "#e5e7eb"        // light borders
const SOFT_BG = "#f8fafc"     // section card background
const SOFT_GREEN_BG = "#ecfdf5"

export interface MemberFormNominee {
  name: string
  relation: string
  phone?: string | null
  email?: string | null
  dateOfBirth?: Date | string | null
  nidNumber?: string | null
  idType?: string | null
  sharePercentage: number
  photoUrl?: string | null
  // Nominee signature URL — the route handler fetches this and passes it as
  // a buffer in `nomineeSignatureBuffers` so the PDF can embed it.
  signatureUrl?: string | null
  addressLine?: string | null
}

export interface MemberFormAddress {
  addressType: string   // CURRENT | PERMANENT
  village?: string | null
  postOffice?: string | null
  district?: string | null
  postalCode?: string | null
  country?: string | null
}

export interface MemberFormDocument {
  documentType: string
  name?: string | null
  fileUrl: string
}

export interface MemberFormPayload {
  // Identity
  id: string
  memberNo: string
  firstName: string
  lastName: string
  fullName: string
  fatherName?: string | null
  motherName?: string | null
  spouseName?: string | null
  dateOfBirth?: Date | string | null
  gender?: string | null
  maritalStatus?: string | null
  marriageDate?: Date | string | null
  religion?: string | null
  nationality?: string | null
  bloodGroup?: string | null
  profession?: string | null
  occupation?: string | null

  // Identity numbers (any one is the "primary" ID)
  nidNumber?: string | null
  passportNumber?: string | null
  birthCertificateNo?: string | null
  drivingLicense?: string | null

  // Contact
  phone: string
  email?: string | null
  emergencyPhone?: string | null
  emergencyContactName?: string | null

  // Bank
  accountName?: string | null
  accountNumber?: string | null
  bankName?: string | null
  branch?: string | null
  routingNumber?: string | null

  // Photo + relations
  photoUrl?: string | null
  // Member signature URL — the route handler fetches this and passes it as
  // `signatureBuffer` so the PDF can embed it in the declaration box.
  signatureUrl?: string | null
  status: string
  kycVerified: boolean
  membershipDate?: Date | string | null
  createdAt: Date | string

  addresses: MemberFormAddress[]
  nominees: MemberFormNominee[]
  documents: MemberFormDocument[]

  // Optional recent savings activity rows rendered at the bottom of the form.
  // The route handler maps `member.savings` into this shape. Optional because
  // older callers (and tests) may build payloads without it.
  recentActivity?: Array<{
    date: Date | string
    type: string
    amount: number
    method?: string | null
    receiptNo?: string | null
  }>
}

export interface MemberFormPdfInput {
  member: MemberFormPayload
  org: OrgInfo
  /** Optional pre-fetched org logo buffer (PNG/JPEG). Drawn in the letterhead next to the org name. */
  logoBuffer?: Buffer | null
  /** Optional pre-fetched member photo buffer (PNG/JPEG). When absent, a placeholder silhouette is drawn. */
  photoBuffer?: Buffer | null
  /** Optional pre-fetched member signature buffer (PNG/JPEG). Embedded in the declaration box. */
  signatureBuffer?: Buffer | null
  /** Optional pre-fetched nominee signature buffers, keyed by nominee index in `member.nominees`. */
  nomineeSignatureBuffers?: (Buffer | null)[]
  /** Optional pre-fetched nominee photo buffers, keyed by nominee index. Shown in Section 4 rows. */
  nomineePhotoBuffers?: (Buffer | null)[]
}

// ── Date / enum formatting helpers ──────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = new Date(d)
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function fmtEnum(val: string | null | undefined): string {
  if (!val) return "—"
  const v = String(val)
  if (v.includes("_POSITIVE")) return v.replace("_POSITIVE", "+")
  if (v.includes("_NEGATIVE")) return v.replace("_NEGATIVE", "-")
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")
}

function orDash(v: string | null | undefined): string {
  if (v === null || v === undefined) return "—"
  const s = String(v).trim()
  return s === "" ? "—" : s
}

/**
 * Build the Membership Application Form PDF.
 * Returns a Promise<Buffer> that resolves with the full PDF bytes.
 */
export async function generateMemberFormPdf(input: MemberFormPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE_WIDTH, PAGE_HEIGHT],
        // Bottom margin = 0 disables pdfkit's auto-page-break. We manually
        // lay out every element with explicit coordinates and have verified
        // the total content height fits on a single A4 page. This prevents
        // pdfkit from creating spurious extra pages when doc.y advances past
        // the bottom margin during the declaration/signature/footer drawing.
        margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
        info: {
          Title: `Membership Application Form — ${input.member.memberNo}`,
          Author: input.org.name,
          Subject: "Member Registration Form",
        },
      })

      const chunks: Buffer[] = []
      doc.on("data", (c: Buffer) => chunks.push(c))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      const { member, org } = input
      const contentWidth = PAGE_WIDTH - MARGIN * 2

      // ── Top decorative bands (navy + green + gold) ──────────────────
      doc.rect(0, 0, PAGE_WIDTH, 14).fill(NAVY)
      doc.rect(0, 14, PAGE_WIDTH, 4).fill(GREEN)
      doc.rect(0, 18, PAGE_WIDTH, 2).fill(GOLD)

      let y = MARGIN

      // ── Letterhead: logo + org name + tagline (left), membership no box (right) ──
      // Logo (if available) sits to the left of the org name. The name text
      // width is reduced to make room.
      const LOGO_SIZE = 60
      const logoX = MARGIN
      const logoY = y
      let textLeftX = MARGIN
      // Widen the text area to ~70% of content width so the org name fits on
      // one line (the membership-no box on the right only needs ~130pt).
      const memBoxW = 100
      let LH_LEFT_W = PAGE_WIDTH - MARGIN - memBoxW - 12 - MARGIN
      if (input.logoBuffer) {
        try {
          // Draw logo in a square box with a thin border.
          doc
            .roundedRect(logoX, logoY, LOGO_SIZE, LOGO_SIZE, 4)
            .strokeColor(LINE)
            .lineWidth(0.8)
            .stroke()
          doc.image(input.logoBuffer, logoX + 2, logoY + 2, {
            fit: [LOGO_SIZE - 4, LOGO_SIZE - 4],
            align: "center",
            valign: "center",
          })
          // Shift text right to make room for the logo.
          textLeftX = MARGIN + LOGO_SIZE + 8
          LH_LEFT_W = LH_LEFT_W - LOGO_SIZE - 8
        } catch {
          // Invalid logo buffer — skip the logo, text starts at MARGIN.
        }
      }

      // Org name — sized to fit on ONE line. "FUTURE SAVINGS FOUNDATION" at
      // 16pt bold fits comfortably in the available width (~430pt). We use
      // characterCount-based fallback: if the name is long, shrink further.
      const nameUpper = org.name.toUpperCase()
      const nameFontSize = nameUpper.length > 28 ? 13 : nameUpper.length > 38 ? 15 : 18
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(nameFontSize)
        .text(nameUpper, textLeftX, y + 4, { width: LH_LEFT_W, lineBreak: false })

      if (org.tagline) {
        doc
          .fillColor(GREEN)
          .font("Helvetica-Oblique")
          .fontSize(9)
          .text(org.tagline, textLeftX, y + 24, { width: LH_LEFT_W })
      }

      // Address + contact line beneath the name. This is ONE continuous
      // string (not an explicit address\ncontact split) so pdfkit wraps it
      // naturally wherever it runs out of width — matching the reference,
      // where the line break happens to fall mid-sentence, right after
      // "...1212 Phone:", rather than at a fixed point before "Phone:".
      const addrParts = [org.addressLine, org.city, org.district, org.postalCode].filter(Boolean)
      const addrLine = addrParts.length ? addrParts.join(", ") : null
      const contactBits: string[] = []
      if (org.phone) contactBits.push(`Phone: ${org.phone}`)
      if (org.email) contactBits.push(`Email: ${org.email}`)
      const subLine = [addrLine, contactBits.join("  ·  ")].filter(Boolean).join(" ")
      if (subLine) {
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(8)
          .text(subLine, textLeftX, y + (org.tagline ? 38 : 24), {
            width: LH_LEFT_W,
            lineGap: 1,
          })
      }

      // Membership No box (top-right) — rounded corners, same "rounded header
      // flush with a square-cornered body" technique as drawSectionCard.
      const memBoxH = 48
      const memBoxX = PAGE_WIDTH - MARGIN - memBoxW
      const memBoxY = y
      const memBoxR = 6
      const memHeaderH = 16
      doc.roundedRect(memBoxX, memBoxY, memBoxW, memBoxH, memBoxR).fillColor("white").fill()
      doc.roundedRect(memBoxX, memBoxY, memBoxW, memBoxH, memBoxR).strokeColor(LINE).lineWidth(0.8).stroke()
      doc.roundedRect(memBoxX, memBoxY, memBoxW, memHeaderH, memBoxR).fillColor(GREEN).fill()
      doc.rect(memBoxX, memBoxY + memHeaderH - memBoxR, memBoxW, memBoxR).fillColor(GREEN).fill()
      doc
        .fillColor("white")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("MEMBERSHIP NO.", memBoxX, memBoxY + 4, { width: memBoxW, align: "center" })
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(18)
        .text(member.memberNo, memBoxX, memBoxY + 22, { width: memBoxW, align: "center" })

      y = Math.max(y + (org.tagline ? 56 : 40), memBoxY + memBoxH) + 8

      // Separator
      doc
        .strokeColor(LINE)
        .lineWidth(1)
        .moveTo(MARGIN, y)
        .lineTo(PAGE_WIDTH - MARGIN, y)
        .stroke()
      y += 10

      // ── Photo + title banner row ─────────────────────────────────────
      const PHOTO_SIZE = 84 // ~square passport photo (slightly smaller to save vertical space)
      const photoX = MARGIN
      const photoY = y

      // Photo frame
      if (input.photoBuffer) {
        try {
          // Clip to the rounded rectangle so the image corners are rounded
          // exactly like the frame, and the photo fills the entire frame.
          doc.save()
          doc.roundedRect(photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 6).clip()
          doc.image(input.photoBuffer, photoX, photoY, {
            cover: [PHOTO_SIZE, PHOTO_SIZE],
            align: "center",
            valign: "center",
          })
          doc.restore()
        } catch {
          // If the image buffer is invalid, fall back to a silhouette.
          drawSilhouette(doc, photoX, photoY, PHOTO_SIZE)
        }
      } else {
        drawSilhouette(doc, photoX, photoY, PHOTO_SIZE)
      }

      // Photo frame border (drawn on top of the image so the edges are clean)
      doc
        .roundedRect(photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 6)
        .strokeColor(LINE)
        .lineWidth(1)
        .stroke()

      // Status badges below the photo.
      // Drawn as colored pills with vector icons (no emoji — PDFKit's
      // Helvetica font doesn't include emoji glyphs, so they'd render as
      // blank boxes or missing-character squares).
      const badgeY = photoY + PHOTO_SIZE + 6
      const badgeH = 18
      const activeW = 72
      const kycW = 55

      // ACTIVE badge — green pill with a vector checkmark
      doc.roundedRect(photoX, badgeY, activeW, badgeH, 9).fillColor(GREEN).fill()
      // Vector checkmark (✓) drawn as two line segments inside a white circle
      const checkCx = photoX + 10
      const checkCy = badgeY + badgeH / 2
      doc.circle(checkCx, checkCy, 6).fillColor("white").fill()
      doc
        .strokeColor(GREEN)
        .lineWidth(1)
        .lineCap("round")
        .moveTo(checkCx - 3, checkCy)
        .lineTo(checkCx - 1, checkCy + 2.5)
        .lineTo(checkCx + 3, checkCy - 2.5)
        .stroke()
      doc
        .fillColor("white")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text((member.status || "ACTIVE").toUpperCase(), photoX + 10, badgeY + 5, {
          width: activeW - 22,
          align: "center",
        })

      // KYC badge — gold pill (only if verified)
      if (member.kycVerified) {
        const kycX = photoX + activeW + 6
        doc.roundedRect(kycX, badgeY, kycW, badgeH, 9).fillColor(GOLD).fill()
        // Vector shield icon (simplified — a rounded triangle on top of a rectangle)
        const shieldCx = kycX + 10
        const shieldCy = badgeY + badgeH / 2
        doc
          .fillColor("white")
          .moveTo(shieldCx, shieldCy - 5)
          .lineTo(shieldCx + 4, shieldCy - 3)
          .lineTo(shieldCx + 4, shieldCy + 1)
          .lineTo(shieldCx, shieldCy + 5)
          .lineTo(shieldCx - 4, shieldCy + 1)
          .lineTo(shieldCx - 4, shieldCy - 3)
          .closePath()
          .fill()
        // Checkmark inside the shield
        doc
          .strokeColor(GOLD)
          .lineWidth(1.2)
          .lineCap("round")
          .moveTo(shieldCx - 2, shieldCy)
          .lineTo(shieldCx - 0.5, shieldCy + 1.5)
          .lineTo(shieldCx + 2, shieldCy - 1.5)
          .stroke()
        doc
          .fillColor("#3b2f00")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text("KYC", kycX + 8, badgeY + 5, {
            width: kycW - 8,
            align: "center",
          })
      }

      // Title banner (right of photo)
      const titleX = photoX + PHOTO_SIZE + 16
      const titleW = PAGE_WIDTH - MARGIN - titleX
      const titleH = 28
      doc.roundedRect(titleX, photoY, titleW, titleH, 15).fillColor(NAVY).fill()
      doc
        .fillColor("white")
        .font("Helvetica-Bold")
        .fontSize(14)
        .text("MEMBERSHIP APPLICATION FORM", titleX, photoY + 8, {
          width: titleW,
          align: "center",
        })

      // Single continuous gold divider under the title banner (the reference
      // has no tagline text here — just one unbroken gold rule).
      const tagY = photoY + titleH + 4
      doc
        .strokeColor(GOLD)
        .lineWidth(1)
        .moveTo(titleX, tagY)
        .lineTo(titleX + titleW, tagY)
        .stroke()

      // Quick info grid (below the gold rule, 4 columns × 2 rows).
      const qiY = tagY + 8
      const qiRowH = 25
      const qiColW = (titleW / 4) + 10
      const quickInfo: [string, string][] = [
        ["Member Name", orDash(member.fullName)],
        ["Member Email", orDash(member.email)],
        ["Emergency Contact", orDash(member.emergencyPhone)],
        ["Date of Birth", fmtDate(member.dateOfBirth)],
        ["Member ID", orDash(member.memberNo)],
        ["Phone Number", orDash(member.phone)],
        ["Emergency Contact Person", orDash(member.emergencyContactName)],
        ["Blood Group", fmtEnum(member.bloodGroup)],
      ]
      quickInfo.forEach(([label, value], i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        const cellX = titleX + col * qiColW 
        const cellY = (qiY + row * qiRowH)
        const upper = label.toUpperCase()
        // Longer labels ("EMERGENCY CONTACT PERSON") get a smaller size so
        // they never wrap onto a second line and collide with the value.
        doc.font("Helvetica-Bold").fontSize(7)
        const labelSize = doc.widthOfString(upper) > qiColW - 6 ? 6 : 6.5
        doc
          .fillColor(MUTED)
          .font("Helvetica-Bold")
          .fontSize(labelSize)
          .text(upper, cellX, cellY, { width: qiColW - 6, lineBreak: false })
        doc
          .fillColor(INK)
          .font("Helvetica")
          .fontSize(8)
          .text(value, cellX, cellY + 8, { width: qiColW - 6, ellipsis: true, lineBreak: false })
      })

      y = Math.max(badgeY + badgeH + 8, qiY + qiRowH * 2 + 8) + 10

      // ── Four numbered sections (3 cols row 1 + full-width row 2) ────
      const SECTION_GAP = 10
      // Row 1: Personal (40%) / Residence (33%) / Banking (27%) — applied
      // to the gap-adjusted available width so col1 + col2 + col3 + 2 gaps
      // still equals contentWidth exactly (no horizontal overflow).
      const availWidth = contentWidth - SECTION_GAP * 2
      const row1Widths = [
        0.40 * availWidth, // col 1 — Personal Information
        0.33 * availWidth, // col 2 — Residence Information
        0.27 * availWidth, // col 3 — Banking Information
      ]
      // Average equal-width column, used only by the Row 2 Nominee
      // (colSpan = 3) full-width calculation below. Keeping it separate
      // avoids coupling the nominee section's width to Row 1's new ratios.
      const sectionW = availWidth / 3
      const sectionPadX = 8
      const sectionPadY = 10
      const sectionHeaderH = 20

      const currentAddress = member.addresses.find((a) => a.addressType === "CURRENT") || null
      const permanentAddress = member.addresses.find((a) => a.addressType === "PERMANENT") || null

      // Section content definitions.
      const sectionPersonal: [string, string][] = [
        ["Father's Name", orDash(member.fatherName)],
        ["Mother's Name", orDash(member.motherName)],
        ["Spouse Name", orDash(member.spouseName)],
        ["Date of Birth", fmtDate(member.dateOfBirth)],
        ["Gender", fmtEnum(member.gender)],
        ["Marital Status", fmtEnum(member.maritalStatus)],
        ["Marriage Date", fmtDate(member.marriageDate)],
        ["Nationality", orDash(member.nationality)],
        ["Religion", orDash(member.religion)],
        ["Blood Group", fmtEnum(member.bloodGroup)],
        ["Profession", orDash(member.profession)],
        ["National ID", orDash(member.nidNumber)],
        ["Passport No", orDash(member.passportNumber)],
        ["Driving License", orDash(member.drivingLicense)],
      ]

      // Banking uses a "label above value" stacked layout in the reference,
      // and — quirk kept intentionally, to match the reference exactly —
      // only "Bank Name" carries a trailing colon; the rest don't.
      const sectionBank: [string, string][] = [
        ["Bank Name:", orDash(member.bankName)],
        ["Branch", orDash(member.branch)],
        ["Account Name", orDash(member.accountName)],
        ["Account Number", orDash(member.accountNumber)],
        ["Routing Number", orDash(member.routingNumber)],
      ]

      // Layout matches the reference design:
      //   Row 1: 3 equal columns — Personal (navy) / Residence (green) / Banking (navy)
      //   Row 2: Full-width Nominee section (green) with 3-column internal layout
      const FIELD_LINE_H = 11
      const BANK_GROUP_H = 28
      const NOM_SUBHEADER_H = 16
      const NOM_GROUP_H = 23

      type RowSpec =
        | { num: number; title: string; color: string; kind: "inline"; fields: [string, string][] }
        | { num: number; title: string; color: string; kind: "stacked"; fields: [string, string][] }
        | { num: number; title: string; color: string; kind: "address" }
        | { num: number; title: string; color: string; kind: "nominee"; colSpan: 3 }

      const row1Specs: RowSpec[] = [
        { num: 1, title: "PERSONAL INFORMATION", color: NAVY, kind: "inline", fields: sectionPersonal },
        { num: 2, title: "RESIDENCE INFORMATION", color: GREEN, kind: "address" },
        { num: 3, title: "BANKING INFORMATION", color: NAVY, kind: "stacked", fields: sectionBank },
      ]
      // Row 2: Nominee — full width (spans all 3 columns).
      const row2Specs: RowSpec[] = [
        { num: 4, title: "NOMINEE INFORMATION", color: GREEN, kind: "nominee", colSpan: 3 },
      ]

      // Compute row heights.
      const computeSectionHeight = (spec: RowSpec): number => {
        switch (spec.kind) {
          case "inline":
            return sectionHeaderH + spec.fields.length * FIELD_LINE_H + sectionPadY * 2
          case "stacked":
            return sectionHeaderH + spec.fields.length * BANK_GROUP_H + sectionPadY * 2
          case "address":
            // Upper-bound estimate: the "Address" line in either block may
            // wrap onto 2 lines, so budget one extra field-row per block.
            return sectionHeaderH + 2 * (14 + 5 * FIELD_LINE_H + 6) + sectionPadY * 2
          case "nominee":
            // Full-width nominee section: nominees sit in 3 columns side by
            // side (not stacked vertically), so the height is one nominee
            // row tall (sub-header + photo/fields).
            return sectionHeaderH + NOM_SUBHEADER_H + 4 * NOM_GROUP_H + sectionPadY * 2
        }
      }

      const row1Heights = row1Specs.map(computeSectionHeight)
      const row1MaxH = Math.max(...row1Heights)
      const row2Heights = row2Specs.map(computeSectionHeight)
      const row2MaxH = row2Heights[0] || 80

      // Row 1 — 3 columns with widths 40% / 33% / 27%.
      row1Specs.forEach((spec, idx) => {
        const i = idx // spec.num - 1 would also work since nums are 1,2,3
        const colW = row1Widths[i]
        // Walk x by accumulating previous column widths + gaps, so each
        // column starts exactly where the previous one ended (+ gap).
        let sx = MARGIN
        for (let j = 0; j < i; j++) {
          sx += row1Widths[j] + SECTION_GAP
        }
        drawSectionCard(doc, sx, y, colW, row1MaxH, spec.num, spec.title, spec.color)
        const innerY = y + sectionHeaderH + sectionPadY
        const innerW = colW - sectionPadX * 2
        if (spec.kind === "inline") {
          drawAlignedKeyValueList(doc, sx + sectionPadX, innerY, innerW, spec.fields, FIELD_LINE_H, "left")
        } else if (spec.kind === "address") {
          drawAddressSection(doc, sx + sectionPadX, innerY, innerW, currentAddress, permanentAddress, FIELD_LINE_H)
        } else if (spec.kind === "stacked") {
          drawStackedKeyValueList(doc, sx + sectionPadX, innerY, innerW, spec.fields, BANK_GROUP_H, {
            labelColor: MUTED,
            labelBold: true,
            labelSize: 8,
            valueSize: 8,
            valueGap: 10,
          })
        }
      })
      y += row1MaxH + SECTION_GAP

      // Row 2 — Full-width Nominee section.
      // The nominee section spans all 3 columns. Internally, up to 3 nominees
      // are laid out side-by-side (each in its own sub-column).
      let r2x = MARGIN
      row2Specs.forEach((spec) => {
        const span = spec.kind === "nominee" ? spec.colSpan : 1
        const sw = span * sectionW + (span - 1) * SECTION_GAP
        drawSectionCard(doc, r2x, y, sw, row2MaxH, spec.num, spec.title, spec.color)
        const innerY = y + sectionHeaderH + sectionPadY
        const innerW = sw - sectionPadX * 2
        if (spec.kind === "nominee") {
          drawNomineeSection(
            doc,
            r2x + sectionPadX,
            innerY,
            innerW,
            member.nominees,
            NOM_GROUP_H,
            input.nomineePhotoBuffers || []
          )
        }
        r2x += sw + SECTION_GAP
      })
      y += row2MaxH + 10

      // ── Declaration + Nominee Signature row ────────────────────────
      // Declaration box is tall enough to fit: header + 3 lines of
      // justified text + signature image + "Applicant Signature" label +
      // date — all with the same breathing room as the reference.
      const declH = 150 // Increased from 138 to add margin after declaration text
      const declW = contentWidth * 0.50
      const nomSigW = contentWidth * 0.48
      const sigGap = contentWidth - declW - nomSigW

      // Declaration box — plain white background, navy border (the
      // reference has no tinted fill here).
      doc.roundedRect(MARGIN, y, declW, declH, 8).fillColor("white").fill()
      doc.roundedRect(MARGIN, y, declW, declH, 8).strokeColor(NAVY).lineWidth(0.8).stroke()
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("DECLARATION", MARGIN + 14, y + 12, { width: declW - 28 })
      doc
        .fillColor(INK)
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(
          "I hereby declare that all the information provided in this application form is true and correct to the best of my knowledge. I agree to abide by the rules, regulations and policies of " +
            org.name +
            ".",
          MARGIN + 14,
          y + 32,
          { width: declW - 28, align: "justify", lineGap: 3 }
        )

      // ── Member signature + date line ──────────────────────────────
      // Both lines sit at the same height. The signature underline is
      // ALWAYS drawn (previously it was skipped whenever a signature image
      // was supplied, which is a bug — the reference always shows the rule,
      // with the signature sitting just above it). No printed name is shown
      // under the signature, matching the reference.
      const sigLineY = y + 126 // Increased from 96 to push signatures down and add margin after text
      const sigLineX2 = MARGIN + declW * 0.55
      const sigImgMaxW = declW * 0.8
      const sigImgMaxH = 32
      if (input.signatureBuffer) {
        try {
          doc.image(input.signatureBuffer, MARGIN + 14, sigLineY - sigImgMaxH, {
            fit: [sigImgMaxW, sigImgMaxH],
            valign: "bottom",
          })
        } catch {
          // fall through — the underline below is drawn regardless.
        }
      }
      doc.strokeColor(INK).lineWidth(1).moveTo(MARGIN + 14, sigLineY).lineTo(sigLineX2, sigLineY).stroke()
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text("Applicant Signature", MARGIN + 14, sigLineY + 4, {
          width: sigLineX2 - (MARGIN + 14),
          align: "center",
        })

      // Date — value sits ABOVE its line, "Date" label BELOW (matches the
      // reference; previously the value was drawn below the line).
      const dateLineX1 = MARGIN + declW * 0.68
      const dateLineX2 = MARGIN + declW - 14
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(10)
        .text(fmtDate(member.membershipDate || member.createdAt), dateLineX1, sigLineY - 14, {
          width: dateLineX2 - dateLineX1,
          align: "center",
        })
      doc.strokeColor(INK).lineWidth(1).moveTo(dateLineX1, sigLineY).lineTo(dateLineX2, sigLineY).stroke()
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text("Date", dateLineX1, sigLineY + 4, { width: dateLineX2 - dateLineX1, align: "center" })

      // ── Nominee signatures box (white bg + green border, horizontal row) ──
      const nomSigX = MARGIN + declW + sigGap
      doc.roundedRect(nomSigX, y, nomSigW, declH, 8).fillColor("white").fill()
      doc.roundedRect(nomSigX, y, nomSigW, declH, 8).strokeColor(GREEN).lineWidth(1).stroke()
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("NOMINEES SIGNATURE", nomSigX + 14, y + 12, { width: nomSigW - 28 })

      const nomineesForSig = member.nominees.slice(0, 3)
      if (nomineesForSig.length === 0) {
        doc
          .fillColor(MUTED)
          .font("Helvetica-Oblique")
          .fontSize(8)
          .text("No nominee registered.", nomSigX + 14, y + declH / 2 - 4, {
            width: nomSigW - 28,
            align: "center",
          })
      } else {
        const slotsTop = y + 34
        const lineY = y + declH - 24
        const slotGap = 10
        const slotW = (nomSigW - 28 - slotGap * (nomineesForSig.length - 1)) / nomineesForSig.length
        nomineesForSig.forEach((n, i) => {
          const sx = nomSigX + 14 + i * (slotW + slotGap)
          // Nominee number + name label at the top of each slot.
          doc
            .fillColor(NAVY)
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(`${i + 1}. ${n.name}`, sx, slotsTop, { width: slotW, ellipsis: true, lineBreak: false })
          // Signature image (if available) — placed above the line, capped
          // so it never looks stretched.
          const slotSigMaxH = Math.min(lineY - (slotsTop + 14), 30)
          const nomSigBuf = input.nomineeSignatureBuffers?.[i] || null
          if (nomSigBuf) {
            try {
              doc.image(nomSigBuf, sx, lineY - slotSigMaxH, {
                fit: [slotW, slotSigMaxH],
                align: "center",
                valign: "bottom",
              })
            } catch {
              // fall through — the line still gets drawn below.
            }
          }
          // Signature line at the bottom of each slot.
          doc.strokeColor(INK).lineWidth(0.8).moveTo(sx, lineY).lineTo(sx + slotW, lineY).stroke()
          doc
            .fillColor(MUTED)
            .font("Helvetica")
            .fontSize(7)
            .text("Signature", sx, lineY + 4, { width: slotW, align: "center" })
        })
      }

      y += declH + 14

      // ── Authorized signatures row (4 zones) ────────────────────────
      const authH = 50
      const zoneW = contentWidth / 4
      const authLabels: [string, string][] = [
        ["AUTHORIZED SIGNATURE", "(Authorized Officer)"],
        ["CHAIRMAN", "(Chairman)"],
        ["OFFICIAL SEAL", ""],
        ["DATE", fmtDate(member.membershipDate || member.createdAt)],
      ]
      authLabels.forEach(([label, sublabel], i) => {
        const zx = MARGIN + i * zoneW
        // Dotted vertical divider between zones
        if (i > 0) {
          doc
            .dash(1, { space: 2 })
            .strokeColor(LINE)
            .lineWidth(0.8)
            .moveTo(zx, y)
            .lineTo(zx, y + authH)
            .stroke()
          doc.undash()
        }
        if (label === "OFFICIAL SEAL") {
          // Draw a dotted circle as the seal placeholder (bigger — matches reference)
          const cx = zx + zoneW / 2
          const cy = y + authH / 2
          doc
            .dash(2, { space: 2 })
            .strokeColor(MUTED)
            .lineWidth(1)
            .circle(cx, cy, 26)
            .stroke()
          doc.undash()
          doc
            .fillColor(MUTED)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text("OFFICIAL", cx - 26, cy - 8, { width: 52, align: "center" })
          doc
            .fillColor(MUTED)
            .font("Helvetica-Bold")
            .fontSize(7)
            .text("SEAL", cx - 22, cy + 1, { width: 44, align: "center" })
        } else {
          // Solid horizontal signature line + label below
          doc
            .strokeColor(INK)
            .lineWidth(1)
            .moveTo(zx + 12, y + authH - 18)
            .lineTo(zx + zoneW - 12, y + authH - 18)
            .stroke()
          doc
            .fillColor(INK)
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(label, zx + 12, y + authH - 14, { width: zoneW - 24, align: "center" })
          if (sublabel) {
            doc
              .fillColor(MUTED)
              .font("Helvetica")
              .fontSize(7)
              .text(sublabel, zx + 12, y + authH - 4, { width: zoneW - 24, align: "center" })
          }
        }
      })

      // Footer removed per spec — address + contacts are already shown in the
      // letterhead at the top, so the bottom footer (navy band, slogan block,
      // address/phone/email repetition) is redundant and has been deleted.

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

// ── Drawing helpers ─────────────────────────────────────────────────────

/** Draw a section card with a colored header bar + numbered circle. */
function drawSectionCard(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  num: number,
  title: string,
  color: string
) {
  const headerH = 20
  // Card background + border
  doc.roundedRect(x, y, w, h, 6).fillColor(SOFT_BG).fill()
  doc.roundedRect(x, y, w, h, 6).strokeColor(LINE).lineWidth(0.8).stroke()
  // Header band
  doc.roundedRect(x, y, w, headerH, 6).fillColor(color).fill()
  // Square off the bottom of the header so it sits flush with the body.
  doc.rect(x, y + headerH - 6, w, 6).fillColor(color).fill()
  // Numbered circle (white-on-color, left side of header)
  const circleR = 7
  const circleX = x + 12
  const circleY = y + headerH / 2
  doc.circle(circleX, circleY, circleR).fillColor("white").fill()
  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(String(num), circleX - circleR, circleY - 4, {
      width: circleR * 2,
      align: "center",
    })
  // Title
  doc
    .fillColor("white")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(title, circleX + circleR + 6, circleY - 4, {
      width: w - (circleX - x) - circleR * 2 - 12,
    })
}

/**
 * Draw a "Label : Value" list where every colon lines up in a straight
 * vertical column — matches the reference form's alignment. The label
 * column width self-sizes to the widest label passed in, so it stays
 * correct regardless of which fields are shown.
 *
 * `align: "left"` produces the Personal-Information style (labels
 * left-aligned, colon column ragged-right of the labels). `align: "right"`
 * produces the Residence-Information style (labels right-aligned, so the
 * colons — not the label starts — form the straight edge).
 */
function drawAlignedKeyValueList(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  items: [string, string][],
  lineH: number,
  align: "left" | "right" = "left"
) {
  const labelFontSize = 7.5
  doc.font("Helvetica").fontSize(labelFontSize)
  const labelColW = Math.max(...items.map(([label]) => doc.widthOfString(label))) + 4
  const valueX = x + labelColW + 6
  const valueW = Math.max(20, w - labelColW - 6)
  items.forEach(([label, value], i) => {
    const ly = y + i * lineH
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(labelFontSize)
      .text(label, x, ly, { width: labelColW, align, lineBreak: false })
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(8)
      .text(": " + value, valueX, ly, { width: valueW, ellipsis: true, lineBreak: false })
  })
}

/**
 * Draw fields where the label sits on its own line and the value sits on
 * the line beneath it. Used by the Banking and Nominee sections, which —
 * unlike Personal/Residence — stack label above value instead of running
 * them inline on one line.
 */
function drawStackedKeyValueList(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  items: [string, string][],
  groupH: number,
  opts: {
    labelColor?: string
    labelBold?: boolean
    labelSize?: number
    valueSize?: number
    valueGap?: number
  } = {}
) {
  const { labelColor = MUTED, labelBold = false, labelSize = 7.5, valueSize = 10, valueGap = 11 } = opts
  items.forEach(([label, value], i) => {
    const gy = y + i * groupH
    doc
      .fillColor(labelColor)
      .font(labelBold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(labelSize)
      .text(label, x, gy, { width: w, ellipsis: true, lineBreak: false })
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(valueSize)
      .text(value, x, gy + valueGap, { width: w, ellipsis: true, lineBreak: false })
  })
}

/**
 * Draw the residence section with two sub-blocks (current + permanent).
 * Sub-headers are plain bold underlined text (no pill background), and the
 * field labels are RIGHT-aligned so their colons form a straight column —
 * both match the reference exactly and differ from the Personal section's
 * left-aligned style. Returns the Y position after the last line drawn.
 */
function drawAddressSection(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  current: MemberFormAddress | null,
  permanent: MemberFormAddress | null,
  lineH = 13
): number {
  const labelFontSize = 7.5
  const labels = ["Address", "Post Office", "District", "Post Code"]
  doc.font("Helvetica").fontSize(labelFontSize)
  const labelColW = Math.max(...labels.map((l) => doc.widthOfString(l))) + 4
  const valueX = x + labelColW + 6
  const valueW = Math.max(20, w - labelColW - 6)

  const drawSub = (label: string, addr: MemberFormAddress | null, sy: number): number => {
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(label + ":", x, sy, { width: w, underline: true, lineBreak: false })
    let cy = sy + 14
    const fields: [string, string][] = [
      ["Address", orDash(addr?.village)],
      ["Post Office", orDash(addr?.postOffice)],
      ["District", orDash(addr?.district)],
      ["Post Code", orDash(addr?.postalCode)],
    ]
    fields.forEach(([flabel, fvalue]) => {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(labelFontSize)
        .text(flabel, x, cy, { width: labelColW, align: "right", lineBreak: false })
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(7.5)
        .text(": " + fvalue, valueX, cy, { width: valueW })
      const rowH = Math.max(lineH, doc.heightOfString(": " + fvalue, { width: valueW }))
      cy += rowH
    })
    return cy
  }

  const afterFirst = drawSub("CURRENT ADDRESS", current, y)
  return drawSub("PERMANENT ADDRESS", permanent, afterFirst + 6)
}

/** Draw the nominee section: up to 3 nominees, each with photo + fields. */
function drawNomineeSection(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  nominees: MemberFormNominee[],
  groupH = 23,
  nomineePhotoBuffers: (Buffer | null)[] = []
) {
  if (nominees.length === 0) {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text("No nominee registered.", x, y, { width: w })
    return
  }
  // Reference layout: nominees are laid out SIDE-BY-SIDE in up to 3 columns.
  // Each column has: a plain-text (no pill) percentage-share header, a photo
  // box on the left, and stacked data fields (Name / Relation / NID / Phone)
  // on the right — label above value, unlike Personal/Residence's inline style.
  const nomineesToShow = nominees.slice(0, 3)
  const colGap = 10
  const colW = (w - colGap * (nomineesToShow.length - 1)) / nomineesToShow.length
  const PHOTO_SIZE = 54
  const PHOTO_GAP = 8
  const SUBHEADER_H = 16
  const colBodyH = SUBHEADER_H + 4 * groupH

  nomineesToShow.forEach((n, i) => {
    const colX = x + i * (colW + colGap)

    // Faint mint-green divider between columns (not after the last one) —
    // present in the reference but absent from the previous implementation.
    if (i > 0) {
      doc
        .roundedRect(colX - colGap / 2 - 1.5, y, 3, colBodyH, 1.5)
        .fillColor(SOFT_GREEN_BG)
        .fill()
    }

    // Sub-header with nominee number + share — plain green text, no pill
    // background (the reference doesn't have one here, unlike the numbered
    // section headers).
    doc
      .fillColor(GREEN)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(`NOMINEE ${i + 1} — ${n.sharePercentage}%`, colX, y, { width: colW, lineBreak: false })

    // Photo box (left side, below sub-header)
    const photoY = y + SUBHEADER_H
    doc
      .roundedRect(colX, photoY, PHOTO_SIZE, PHOTO_SIZE, 4)
      .strokeColor(LINE)
      .lineWidth(0.8)
      .stroke()
    const photoBuf = nomineePhotoBuffers[i]
    let drewPhoto = false
    if (photoBuf) {
      try {
        doc.image(photoBuf, colX + 2, photoY + 2, {
          fit: [PHOTO_SIZE - 4, PHOTO_SIZE - 4],
          align: "center",
          valign: "center",
        })
        drewPhoto = true
      } catch {
        drewPhoto = false
      }
    }
    if (!drewPhoto) {
      // Text placeholder — matches the reference form exactly, which shows
      // a static "Nominee / 1 / Photo" caption in EVERY slot (not the
      // nominee's own position). Kept literal on purpose for an exact
      // visual match; swap in `${i + 1}` instead of the literal "1" if the
      // per-nominee numbering turns out to have been unintentional upstream.
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text("Nominee\n1\nPhoto", colX, photoY + PHOTO_SIZE / 2 - 14, {
          width: PHOTO_SIZE,
          align: "center",
          lineGap: 1,
        })
    }

    // Data fields (right side of photo, below sub-header) — stacked,
    // bold black labels (darker/bolder than Personal/Residence/Banking's
    // muted-grey labels, matching the reference).
    const dataX = colX + PHOTO_SIZE + PHOTO_GAP
    const dataW = colW - PHOTO_SIZE - PHOTO_GAP
    const fields: [string, string][] = [
      ["Name:", orDash(n.name)],
      ["Relation:", orDash(n.relation)],
      ["NID:", orDash(n.nidNumber)],
      ["Phone:", orDash(n.phone)],
    ]
    drawStackedKeyValueList(doc, dataX, photoY, dataW, fields, groupH, {
      labelColor: MUTED,    // <--- CHANGED TO MUTED
      labelBold: true,
      labelSize: 8.5,
      valueSize: 8,
      valueGap: 11,
    })
  })
}

/** Draw the required-documents checklist. */
function drawDocumentsChecklist(
  doc: PDFDocument,
  x: number,
  y: number,
  w: number,
  documents: MemberFormDocument[]
) {
  // "Attached Documents" — only lists documents the member has actually
  // uploaded (from the MemberDocument table). Each gets a green ✓ checkmark
  // drawn as a vector path (PDFKit's Helvetica doesn't include the ✓ glyph
  // reliably across all PDF readers, so we draw it as lines instead).
  if (documents.length === 0) {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text("No documents attached.", x, y, { width: w })
    return
  }
  const lineH = 14
  documents.slice(0, 8).forEach((docItem, i) => {
    const ly = y + i * lineH
    // Green filled circle as the checkmark background
    const dotCx = x + 4
    const dotCy = ly + 6
    doc.circle(dotCx, dotCy, 5).fillColor(GREEN).fill()
    // White vector checkmark inside the circle
    doc
      .strokeColor("white")
      .lineWidth(1.3)
      .lineCap("round")
      .moveTo(dotCx - 2, dotCy)
      .lineTo(dotCx - 0.5, dotCy + 1.8)
      .lineTo(dotCx + 2.2, dotCy - 1.8)
      .stroke()
    // Document name + type
    const label = docItem.name?.trim() || docItem.documentType || "Document"
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(8)
      .text(label, x + 14, ly + 1, { width: w - 14, ellipsis: true })
  })
}

/** Draw a simple silhouette placeholder when no member photo is available. */
function drawSilhouette(doc: PDFDocument, x: number, y: number, size: number) {
  const cx = x + size / 2
  const headR = size * 0.18
  const headY = y + size * 0.38
  doc.circle(cx, headY, headR).fillColor("#cbd5e1").fill()
  // Shoulders/torso (rounded rectangle)
  const torsoW = size * 0.6
  const torsoH = size * 0.45
  const torsoX = cx - torsoW / 2
  const torsoY = y + size * 0.58
  doc
    .roundedRect(torsoX, torsoY, torsoW, torsoH, torsoW / 2)
    .fillColor("#cbd5e1")
    .fill()
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(7)
    .text("No Photo", x, y + size - 12, { width: size, align: "center" })
}
