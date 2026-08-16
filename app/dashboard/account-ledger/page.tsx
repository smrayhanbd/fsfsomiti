import prisma from "@/lib/prisma"
import AccountLedgerClient from "./AccountLedgerClient"
import { getOrganization } from "@/lib/organization"
import type { AccountType } from "@/lib/accounting"
import type { Prisma } from "@prisma/client"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function AccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; from?: string; to?: string }>
}) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Finance & Accounting", "Account Ledger")


  const params = await searchParams
  const selectedAccountId = params.accountId || null
  const from = params.from || null
  const to = params.to || null

  // Build the account picker list (flat, posting-allowed, active).
  const allAccounts = await prisma.account.findMany({
    where: { status: "ACTIVE", allowPosting: true },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      currentBalance: true,
    },
    orderBy: [{ accountType: "asc" }, { accountCode: "asc" }],
  })

  // Selected account detail (if any).
  let selected: {
    id: string
    accountCode: string
    accountName: string
    accountType: AccountType
    nature: string
    openingBalance: Prisma.Decimal
    currentBalance: Prisma.Decimal
    currency: string
  } | null = null

  let openingAtFrom: number | null = null
  let lines: {
    id: string
    date: Date
    voucherNo: string
    narration: string
    voucherType: string
    debit: number
    credit: number
    memo: string | null
  }[] = []

  if (selectedAccountId) {
    selected = await prisma.account.findUnique({
      where: { id: selectedAccountId },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        nature: true,
        openingBalance: true,
        currentBalance: true,
        currency: true,
      },
    })

    if (selected) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) {
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        dateFilter.lte = end
      }

      // Lines within the window, oldest first so we can compute a running balance.
      const journalLines = await prisma.journalLine.findMany({
        where: {
          accountId: selected.id,
          journalEntry: {
            status: "POSTED",
            ...(Object.keys(dateFilter).length
              ? { entryDate: dateFilter }
              : {}),
          },
        },
        include: {
          journalEntry: {
            select: {
              voucherNo: true,
              entryDate: true,
              narration: true,
              voucherType: true,
            },
          },
        },
        orderBy: { journalEntry: { entryDate: "asc" } },
      })

      // Compute opening balance at the start of the window = account opening
      // balance + the net effect of all postings before `from`.
      const beforeFilter: Prisma.DateTimeFilter | null = from
        ? { lt: new Date(from) }
        : null
      let priorMovement = 0
      if (beforeFilter) {
        const prior = await prisma.journalLine.aggregate({
          where: {
            accountId: selected.id,
            journalEntry: { status: "POSTED", entryDate: beforeFilter },
          },
          _sum: { debit: true, credit: true },
        })
        const d = Number(prior._sum.debit ?? 0)
        const c = Number(prior._sum.credit ?? 0)
        priorMovement =
          selected.nature === "DEBIT" ? d - c : c - d
      }
      openingAtFrom = Number(selected.openingBalance ?? 0) + priorMovement

      lines = journalLines.map((l) => ({
        id: l.id,
        date: l.journalEntry.entryDate,
        voucherNo: l.journalEntry.voucherNo,
        narration: l.journalEntry.narration,
        voucherType: l.journalEntry.voucherType,
        debit: Number(l.debit),
        credit: Number(l.credit),
        memo: l.memo,
      }))
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Account Ledger
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Drill into the running-balance statement for any ledger account.
        </p>
      </div>
      <AccountLedgerClient
        accounts={JSON.parse(JSON.stringify(allAccounts))}
        selectedAccountId={selectedAccountId}
        from={from}
        to={to}
        selected={selected ? JSON.parse(JSON.stringify(selected)) : null}
        openingAtFrom={openingAtFrom}
        lines={JSON.parse(JSON.stringify(lines))}
        org={await getOrganization()}
      />
    </div>
  )
}
