import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { rowsToCsv } from "@/lib/export/csv"
import type { TransactionType, TransactionStatus } from "@/lib/transactions/types"

export const dynamic = "force-dynamic"

/**
 * GET /api/transactions/export
 *
 * Streams a CSV of transactions matching the given filters. Query params:
 *   - status      TransactionStatus (DRAFT / PENDING_APPROVAL / APPROVED /
 *                 RETURNED / REJECTED / REVERSED). Omit for all.
 *   - type        TransactionType (DEPOSIT / WITHDRAWAL / CHARGE /
 *                 INCOME_DISTRIBUTION). Omit for all.
 *   - from        ISO date — filter createdAt >= from.
 *   - to          ISO date — filter createdAt <= to.
 *   - memberId    Restrict to a single member.
 *
 * Auth: any authenticated dashboard user (ADMIN / SUPER_ADMIN). The CSV
 * contains no secrets — only the financial fields a reviewer would expect on
 * an exported ledger.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const role = session.user.role
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && !isSuperAdmin({ role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const status = sp.get("status") as TransactionStatus | null
  const type = sp.get("type") as TransactionType | null
  const from = sp.get("from")
  const to = sp.get("to")
  const memberId = sp.get("memberId")

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (type) where.transactionType = type
  if (memberId) where.memberId = memberId
  if (from || to) {
    const createdAt: Record<string, Date> = {}
    if (from) createdAt.gte = new Date(from)
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      createdAt.lte = end
    }
    where.createdAt = createdAt
  }

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      voucherNo: true,
      transactionType: true,
      subType: true,
      chargeTypeName: true,
      status: true,
      amount: true,
      paymentMethod: true,
      referenceNo: true,
      createdAt: true,
      approvedAt: true,
      approvedBy: true,
      member: { select: { memberNo: true, fullName: true } },
      cashAccount: { select: { accountName: true } },
      createdBy: true,
    },
    take: 5000, // safety cap — exports beyond 5k rows should paginate
  })

  const columns = [
    "voucherNo",
    "transactionType",
    "subType",
    "chargeTypeName",
    "status",
    "amount",
    "paymentMethod",
    "referenceNo",
    "memberNo",
    "memberName",
    "cashAccountName",
    "createdBy",
    "approvedBy",
    "createdAt",
    "approvedAt",
  ]

  const csvRows = rows.map((r) => ({
    voucherNo: r.voucherNo,
    transactionType: r.transactionType,
    subType: r.subType,
    chargeTypeName: r.chargeTypeName ?? "",
    status: r.status,
    amount: Number(r.amount).toFixed(2),
    paymentMethod: r.paymentMethod ?? "",
    referenceNo: r.referenceNo ?? "",
    memberNo: r.member?.memberNo ?? "",
    memberName: r.member?.fullName ?? "",
    cashAccountName: r.cashAccount?.accountName ?? "",
    createdBy: r.createdBy,
    approvedBy: r.approvedBy ?? "",
    createdAt: r.createdAt.toISOString(),
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : "",
  }))

  const csv = rowsToCsv(csvRows, columns)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
