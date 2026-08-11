import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import {
  generateLedgerStatementPdf,
  type LedgerStatementPayload,
  type LedgerStatementRow,
} from "@/lib/pdf/ledgerStatementPdf"
import type { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/portal/statement/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Member-portal route — returns a downloadable PDF Ledger Statement for the
 * authenticated member's own savings account, optionally filtered to a date
 * window. Mirrors the data shape of the admin `/dashboard/member-ledger` page
 * so the downloadable PDF matches what an admin would print from the dashboard.
 *
 * Auth: the session user MUST be a MEMBER. The ledger is always scoped to
 * `session.user.id` — `memberId` is never read from the query string.
 *
 * Query params (all optional):
 *   - from: ISO date string (YYYY-MM-DD). Rows before this date are excluded
 *           from the movement table but contribute to the opening balance.
 *   - to:   ISO date string (YYYY-MM-DD). Inclusive of the whole day.
 */
export async function GET(req: NextRequest) {
  // 1. Auth — members only.
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const memberId = session.user.id

  // 2. Parse + validate query params.
  const { searchParams } = new URL(req.url)
  const fromRaw = searchParams.get("from") || null
  const toRaw = searchParams.get("to") || null

  let from: Date | null = null
  let to: Date | null = null
  try {
    if (fromRaw) {
      from = new Date(fromRaw)
      if (isNaN(from.getTime())) from = null
    }
    if (toRaw) {
      to = new Date(toRaw)
      if (isNaN(to.getTime())) to = null
    }
  } catch {
    // Swallow parse errors and just drop the filter — graceful degradation.
  }

  // 3. Load the member + their savings rows for the window.
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      phone: true,
      email: true,
      membershipDate: true,
      addresses: {
        where: { addressType: "CURRENT" },
        select: {
          village: true,
          postOffice: true,
          policeStation: true,
          district: true,
          postalCode: true,
        },
        take: 1,
      },
    },
  })

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  // Date window filter (entryDate-aware; `to` is inclusive of the whole day).
  const dateFilter: Prisma.SavingsWhereInput["date"] = {}
  if (from) dateFilter.gte = from
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    dateFilter.lte = end
  }
  const hasDateFilter = Object.keys(dateFilter).length > 0

  // Savings rows within the window, oldest-first.
  // Include the GL mirror so we can show the voucher number + the real
  // deposit-type name + remarks/reference (the savings row's `type` field is
  // hard-coded to "MONTHLY" for every deposit by savingsTypeFor()).
  const rows = await prisma.savings.findMany({
    where: {
      memberId: member.id,
      ...(hasDateFilter ? { date: dateFilter } : {}),
    },
    orderBy: { date: "asc" },
    include: {
      transactionMirror: {
        select: {
          voucherNo: true,
          status: true,
          remarks: true,
          referenceNo: true,
          chargeTypeName: true,
          breakdown: true,
          transactionType: true,
          subType: true,
        },
      },
    },
  })

  // Opening balance at start of window = sum of all movement BEFORE `from`.
  // Type filter is intentionally NOT applied — opening is a balance, not a
  // within-period lens.
  let openingBalance = 0
  if (from) {
    const priorRows = await prisma.savings.findMany({
      where: { memberId: member.id, date: { lt: from } },
      select: { type: true, amount: true },
    })
    for (const p of priorRows) {
      openingBalance +=
        p.type === "WITHDRAWAL" ? -Number(p.amount) : Number(p.amount)
    }
  } else {
    // No `from` filter — opening is 0 (full history from the very start).
    openingBalance = 0
  }

  // All-time totals — independent of the date window — for the summary header.
  const allRows = await prisma.savings.findMany({
    where: { memberId: member.id },
    select: { type: true, amount: true },
  })
  let totalDepositsAllTime = 0
  let totalWithdrawalsAllTime = 0
  for (const s of allRows) {
    if (s.type === "WITHDRAWAL") totalWithdrawalsAllTime += Number(s.amount)
    else totalDepositsAllTime += Number(s.amount)
  }

  // Build the movement rows + accumulate period totals + running balance.
  let running = openingBalance
  let totalDebit = 0
  let totalCredit = 0
  const statementRows: LedgerStatementRow[] = rows.map((s) => {
    const amount = Number(s.amount ?? 0)
    const isWithdrawal = s.type === "WITHDRAWAL"
    const debit = isWithdrawal ? amount : 0
    const credit = isWithdrawal ? 0 : amount
    running += credit - debit
    totalDebit += debit
    totalCredit += credit

    // Resolve the "Type" label (mirror of admin member-ledger logic).
    const mirror = s.transactionMirror
    let typeLabel = s.type
    if (mirror) {
      const breakdown = mirror.breakdown as
        | { collectionTypeName?: string }
        | null
      typeLabel =
        breakdown?.collectionTypeName?.trim() ||
        mirror.chargeTypeName?.trim() ||
        s.type
    }

    // Description = remarks + reference (mirror of admin member-ledger logic).
    const remarks = mirror?.remarks?.trim() || ""
    const referenceNo = mirror?.referenceNo?.trim() || ""
    const description = [remarks, referenceNo ? `Ref: ${referenceNo}` : ""]
      .filter(Boolean)
      .join(" | ")

    return {
      date: s.date.toISOString(),
      description,
      // Prefer the savings receipt number; fall back to the GL voucher number.
      ref: s.receiptNo || mirror?.voucherNo || "",
      typeLabel,
      // Humanize the method label to match the admin's on-screen + print view
      // (e.g. "BANK_TRANSFER" → "Bank Transfer").
      method: s.method
        ? s.method
            .toLowerCase()
            .replace(/_+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "—",
      debit,
      credit,
      balance: running,
    }
  })

  const closingBalance = openingBalance + totalCredit - totalDebit

  // 4. Period label for the header.
  const fmtPeriod = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  const earliest =
    from ?? (rows[0]?.date ? new Date(rows[0].date) : member.membershipDate)
  const latest = to ?? (rows[rows.length - 1]?.date ? new Date(rows[rows.length - 1].date) : new Date())
  const period =
    earliest && latest
      ? `${fmtPeriod(new Date(earliest))} to ${fmtPeriod(new Date(latest))}`
      : "All time"

  // Single-line address for the header.
  const a = member.addresses[0]
  const address = a
    ? [a.village, a.postOffice, a.policeStation, a.district, a.postalCode]
        .filter(Boolean)
        .join(", ") || null
    : null

  // 5. Load org branding.
  const org = await getOrganization()

  const payload: LedgerStatementPayload = {
    org,
    member: {
      memberNo: member.memberNo,
      fullName: member.fullName,
      phone: member.phone,
      email: member.email,
      address,
      membershipDate: member.membershipDate?.toISOString() ?? null,
    },
    period,
    openingBalance,
    totalDepositsAllTime,
    totalWithdrawalsAllTime,
    rows: statementRows,
    totalDebit,
    totalCredit,
    closingBalance,
  }

  // 6. Render + return as a download.
  const pdf = await generateLedgerStatementPdf(payload)
  const filename = `ledger-statement-${member.memberNo}.pdf`
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
