 
// GET /api/elections/:electionId/certificate
// Generates a PDF result certificate (spec §47). Uses the existing pdfkit dep.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser, hasPermission, isSuperAdmin, PERMISSIONS } from "@/lib/permissions"
import PDFDocument from "pdfkit"
import { getOrganization } from "@/lib/organization"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ electionId: string }> }
) {
  const params = await context.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const allowed = isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.ELECTION_MANAGE, user)) || (await hasPermission(user.id, PERMISSIONS.ELECTION_VIEW, user))
  if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 })

  const election = await prisma.election.findUnique({
    where: { id: params.electionId },
    include: {
      positions: {
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
        include: { results: { orderBy: { rank: "asc" } } },
      },
    },
  })
  if (!election) return NextResponse.json({ error: "Election not found." }, { status: 404 })
  if (!election.resultHash) return NextResponse.json({ error: "Results have not been counted yet." }, { status: 400 })

  const org = await getOrganization()
  const [eligible, voted] = await Promise.all([
    prisma.electionEligibility.count({ where: { electionId: election.id, eligible: true } }),
    prisma.electionParticipation.count({ where: { electionId: election.id, voted: true } }),
  ])
  const turnout = eligible > 0 ? (voted / eligible) * 100 : 0
  const quorumMet = !election.quorumRequired || turnout >= Number(election.minTurnoutPercentage || 0)

  // Build PDF.
  const doc = new PDFDocument({ size: "A4", margin: 50 })
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text(org.name || "Somiti", { align: "center" })
  doc.moveDown(0.3)
  doc.fontSize(12).font("Helvetica").text("CERTIFICATE OF ELECTION RESULT", { align: "center" })
  doc.moveDown(0.5)
  doc.fontSize(14).font("Helvetica-Bold").text(election.name, { align: "center" })
  if (election.description) {
    doc.fontSize(9).font("Helvetica").text(election.description, { align: "center" })
  }
  doc.moveDown(0.3)
  doc.fontSize(10).text(
    `Term: ${election.termStartDate.toLocaleDateString()} – ${election.termEndDate.toLocaleDateString()}`,
    { align: "center" }
  )
  doc.moveDown(1)

  // Statistics box
  doc.fontSize(10).font("Helvetica-Bold").text("Election Statistics", { underline: true })
  doc.moveDown(0.2)
  doc.font("Helvetica").fontSize(10)
  doc.text(`Eligible Voters: ${eligible}`)
  doc.text(`Votes Cast: ${voted}`)
  doc.text(`Turnout: ${turnout.toFixed(2)}%`)
  doc.text(`Quorum: ${election.quorumRequired ? (quorumMet ? "MET" : "NOT MET") : "Not required"}${election.quorumRequired ? ` (threshold ${Number(election.minTurnoutPercentage || 0)}%)` : ""}`)
  doc.moveDown(1)

  // Results per position
  doc.fontSize(10).font("Helvetica-Bold").text("Position-wise Results", { underline: true })
  doc.moveDown(0.2)
  for (const pos of election.positions) {
    doc.font("Helvetica-Bold").fontSize(11).text(pos.name)
    doc.font("Helvetica").fontSize(10)
    if (pos.results.length === 0) {
      doc.text("  (No results recorded)")
    } else {
      for (const r of pos.results) {
        const marker = r.elected ? " [ELECTED]" : ""
        doc.text(`  ${r.label}: ${r.voteCount} votes${marker}`)
      }
    }
    doc.moveDown(0.3)
  }

  // Verification
  doc.moveDown(1)
  doc.fontSize(10).font("Helvetica-Bold").text("Verification", { underline: true })
  doc.moveDown(0.2)
  doc.font("Courier").fontSize(9)
  doc.text(`Result Hash (SHA-256): ${election.resultHash}`)
  doc.moveDown(0.5)
  doc.font("Helvetica").fontSize(9)
  doc.text(`Published: ${new Date().toLocaleString()}`)

  // Signature area
  doc.moveDown(2)
  doc.font("Helvetica").fontSize(10)
  doc.text("_________________________         _________________________")
  doc.text("  Authorized Signature                        Official Seal")

  doc.end()

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="election-certificate-${election.code}.pdf"`,
    },
  })
}
