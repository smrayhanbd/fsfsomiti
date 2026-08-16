import prisma from "@/lib/prisma"
import MemberLedgerClient from "./MemberLedgerClient"
import { getOrganization } from "@/lib/organization"
import type { MemberStatusLite } from "@/components/MemberSelect"
import type { Prisma } from "@prisma/client"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

/**
 * Member Ledger — ERP-grade statement of a single member's savings activity.
 *
 * Reads the member-facing Savings ledger (the same rows the portal, due-list,
 * and trust-score code read). For an approved Transaction these Savings rows
 * are the mirror created by postTransactionEffects(), linked via
 * `savingsMirrorId` so each row carries the GL voucher number too.
 *
 * Mirrors account-ledger/page.tsx: a member picker + date window + type filter,
 * with an opening balance rolled forward into a running-balance table.
 */
export default async function MemberLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    memberId?: string
    from?: string
    to?: string
    type?: string
  }>
}) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Finance & Accounting", "Member Ledger")


  const params = await searchParams
  const selectedMemberId = params.memberId || null
  const from = params.from || null
  const to = params.to || null
  const typeFilter = params.type || null

  // ── Member picker list (non-deleted members, most-active first). ──────────
  // Sorted by memberNo for stable, human-friendly ordering.
  const allMembers = await prisma.member.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      phone: true,
      status: true,
    },
    orderBy: { memberNo: "asc" },
  })

  // ── Selected member detail + ledger. ──────────────────────────────────────
  type SelectedMember = {
    id: string
    memberNo: string
    fullName: string
    phone: string
    email: string | null
    photoUrl: string | null
    status: string
    membershipDate: Date
    address: string | null
  }

  let selected: SelectedMember | null = null
  let openingAtFrom = 0
  let totalDepositsAllTime = 0
  let totalWithdrawalsAllTime = 0
  let lines: {
    id: string
    date: Date
    receiptNo: string | null
    type: string
    method: string
    amount: number
    debit: number
    credit: number
    voucherNo: string | null
    /**
     * Human-readable label for the on-screen "Type" column and the print
     * statement's "Type" column. Resolved from the linked Transaction's
     * breakdown.collectionTypeName (the deposit-type name picked at entry —
     * e.g. "Membership Deposit"), falling back to chargeTypeName, then to the
     * raw savings.type. Without this, every deposit shows as "Monthly"
     * because savingsTypeFor("DEPOSIT") hard-codes "MONTHLY" on the mirror
     * row (see lib/transactions/validation.ts).
     */
    typeLabel: string
    /**
     * Combination of the linked Transaction's remarks + referenceNo. Used by
     * the on-screen "Description" column and the print statement's
     * "Description" column. Empty string when neither is set.
     */
    description: string
  }[] = []
  let loanSummary: {
    principal: number
    outstanding: number
    paid: number
    activeCount: number
  } | null = null

  if (selectedMemberId) {
    const member = await prisma.member.findUnique({
      where: { id: selectedMemberId },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        phone: true,
        email: true,
        photoUrl: true,
        status: true,
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

    if (member) {
      // Resolve a single-line address for the printable statement header.
      const a = member.addresses[0]
      const addressParts = [
        a?.village,
        a?.postOffice,
        a?.policeStation,
        a?.district,
        a?.postalCode,
      ].filter(Boolean)
      const address = addressParts.length ? addressParts.join(", ") : null
      const { addresses: _addresses, ...memberRest } = member
      selected = { ...memberRest, address }

      // Date window filter (entryDate-aware; `to` is inclusive of the whole day).
      const dateFilter: Prisma.DateTimeFilter = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        dateFilter.lte = end
      }
      const hasDateFilter = Object.keys(dateFilter).length > 0

      // Savings rows within the window. We also fetch the optional GL link so
      // the ledger can show the posting voucher number alongside the receipt.
      const where: Prisma.SavingsWhereInput = {
        memberId: selected.id,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(hasDateFilter ? { date: dateFilter } : {}),
      }

      const rows = await prisma.savings.findMany({
        where,
        orderBy: { date: "asc" },
        include: {
          transactionMirror: {
            select: {
              voucherNo: true,
              status: true,
              // Used to build the on-screen + print "Description" column as a
              // combination of Remarks + Reference Number.
              remarks: true,
              referenceNo: true,
              // Used to resolve the real deposit-type name for the "Type"
              // column (the savings row's `type` is hard-coded to "MONTHLY"
              // for every deposit — see savingsTypeFor()).
              chargeTypeName: true,
              breakdown: true,
              transactionType: true,
              subType: true,
            },
          },
        },
      })

      lines = rows.map((s) => {
        const amount = Number(s.amount ?? 0)
        // Member-ledger convention (mirrors portal/savings + dueCalculator):
        // WITHDRAWAL reduces the member balance (debit side); all other types
        // are credits (money received into the member's savings).
        const isWithdrawal = s.type === "WITHDRAWAL"

        // ── Resolve the "Type" label for the ledger. ───────────────────────
        // The savings row's `type` is hard-coded per TransactionType by
        // savingsTypeFor() (DEPOSIT → "MONTHLY"), so it doesn't reflect what
        // the user actually picked as the deposit type. The real name lives
        // on the linked Transaction — either inside the JSON `breakdown`
        // (deposits: { collectionTypeId, collectionTypeName }) or as the
        // flat `chargeTypeName` column (custom charges).
        const mirror = s.transactionMirror
        let typeLabel = s.type // last-resort fallback (raw savings.type)
        if (mirror) {
          const breakdown = mirror.breakdown as
            | { collectionTypeName?: string }
            | null
          typeLabel =
            breakdown?.collectionTypeName?.trim() ||
            mirror.chargeTypeName?.trim() ||
            s.type
        }

        // ── Build the "Description" text. ──────────────────────────────────
        // Combination of Remarks + Reference Number, separated by " | " when
        // both are present. Empty string when neither is set so the cell
        // renders an em-dash placeholder via the client component.
        const remarks = mirror?.remarks?.trim() || ""
        const referenceNo = mirror?.referenceNo?.trim() || ""
        const description = [remarks, referenceNo ? `Ref: ${referenceNo}` : ""]
          .filter(Boolean)
          .join(" | ")

        return {
          id: s.id,
          date: s.date,
          receiptNo: s.receiptNo,
          type: s.type,
          method: s.method,
          amount,
          debit: isWithdrawal ? amount : 0,
          credit: isWithdrawal ? 0 : amount,
          voucherNo: mirror?.voucherNo ?? null,
          typeLabel,
          description,
        }
      })

      // Opening balance at start of window = sum of all non-filtered movement
      // BEFORE `from`. Type filter does NOT affect the opening (a type filter is
      // a within-period lens, not a balance redefinition).
      const beforeFilter: Prisma.SavingsWhereInput = { memberId: selected.id }
      if (from) beforeFilter.date = { lt: new Date(from) }
      const priorRows = await prisma.savings.findMany({
        where: beforeFilter,
        select: { type: true, amount: true },
      })
      for (const p of priorRows) {
        openingAtFrom +=
          p.type === "WITHDRAWAL" ? -Number(p.amount) : Number(p.amount)
      }

      // All-time totals (independent of the date window) for the summary header.
      const allRows = await prisma.savings.findMany({
        where: { memberId: selected.id },
        select: { type: true, amount: true },
      })
      for (const s of allRows) {
        if (s.type === "WITHDRAWAL") totalWithdrawalsAllTime += Number(s.amount)
        else totalDepositsAllTime += Number(s.amount)
      }

      // Loan snapshot for the summary header (active/disbursed loans only).
      const loans = await prisma.loan.findMany({
        where: { memberId: selected.id, status: { in: ["DISBURSED", "DEFAULTED"] } },
        select: { principal: true, outstandingBalance: true, principalPaid: true },
      })
      if (loans.length) {
        loanSummary = {
          principal: loans.reduce((s, l) => s + Number(l.principal), 0),
          outstanding: loans.reduce((s, l) => s + Number(l.outstandingBalance), 0),
          paid: loans.reduce((s, l) => s + Number(l.principalPaid), 0),
          activeCount: loans.length,
        }
      }
    }
  }

  // Distinct savings types present across the system — drives the type filter.
  const typeAgg = await prisma.savings.findMany({
    distinct: ["type"],
    select: { type: true },
  })
  const availableTypes = typeAgg.map((t) => t.type).sort()

  // Org branding — used by the printable statement header.
  const org = await getOrganization()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Member Ledger
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Drill into the running-balance statement for any member&apos;s savings
          account.
        </p>
      </div>
      <MemberLedgerClient
        members={JSON.parse(JSON.stringify(allMembers)) as (typeof allMembers[number] & { status: MemberStatusLite })[]}
        selectedMemberId={selectedMemberId}
        from={from}
        to={to}
        typeFilter={typeFilter}
        availableTypes={availableTypes}
        selected={selected ? JSON.parse(JSON.stringify(selected)) : null}
        openingAtFrom={openingAtFrom}
        totalDepositsAllTime={totalDepositsAllTime}
        totalWithdrawalsAllTime={totalWithdrawalsAllTime}
        loanSummary={loanSummary}
        lines={JSON.parse(JSON.stringify(lines))}
        org={org}
      />
    </div>
  )
}
