// Loan Schedule Engine
// Pure, Prisma-independent functions for generating amortization schedules.
// Used both on the server (when persisting a loan) and on the client (live preview).

export type RepaymentFreq =
  | "DAILY"
  | "WEEKLY"
  | "FORTNIGHTLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "CUSTOM"

export type InterestType = "FLAT" | "REDUCING"

export interface ScheduleRow {
  installmentNo: number
  dueDate: Date
  principal: number
  interest: number
  installmentAmount: number
  balanceAfter: number
}

export interface ScheduleSummary {
  rows: ScheduleRow[]
  totalPrincipal: number
  totalInterest: number
  totalPayable: number
  installmentAmount: number
}

export interface ScheduleInput {
  principal: number
  annualRate: number // percent, e.g. 12 = 12%
  interestType: InterestType
  repaymentFreq: RepaymentFreq
  numberOfInstallments: number
  disburseDate: Date
  gracePeriod?: number // grace in days before the first installment is due
}

// Number of periods per year for each frequency (used to derive the periodic rate)
export const PERIODS_PER_YEAR: Record<RepaymentFreq, number> = {
  DAILY: 365,
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
  CUSTOM: 12, // fallback; admin typically overrides dates manually
}

// Round to 2 decimal places (avoids floating-point drift)
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Add one period to a date, honouring the frequency.
export function addInterval(date: Date, freq: RepaymentFreq, periods = 1): Date {
  const d = new Date(date)
  switch (freq) {
    case "DAILY":
      d.setDate(d.getDate() + periods)
      break
    case "WEEKLY":
      d.setDate(d.getDate() + 7 * periods)
      break
    case "FORTNIGHTLY":
      d.setDate(d.getDate() + 14 * periods)
      break
    case "MONTHLY":
      addMonths(d, periods)
      break
    case "QUARTERLY":
      addMonths(d, 3 * periods)
      break
    case "YEARLY":
      d.setFullYear(d.getFullYear() + periods)
      break
    case "CUSTOM":
      addMonths(d, periods)
      break
  }
  return d
}

// Month addition that clamps the day to the target month's length
// (e.g. Jan 31 + 1 month -> Feb 28/29, not Mar 3).
function addMonths(d: Date, months: number) {
  const targetMonth = d.getMonth() + months
  d.setMonth(targetMonth)
  // If we overflowed (e.g. Jan 31 -> Feb 31 became Mar 3), pull back to month end.
  const target = ((d.getMonth() + 12 - (targetMonth % 12)) % 12)
  if (target !== 0 && months > 0) {
    // setMonth landed us past the end of the intended month; clamp.
    d.setDate(0) // last day of previous month relative to the (overflowed) position
  }
}

// --- Flat interest (simple interest on the original principal) ---
// Total interest = principal * rate * years ; EMI = (principal + interest) / installments.
// Each installment splits the total interest evenly.
function generateFlatSchedule(input: ScheduleInput): ScheduleSummary {
  const { principal, annualRate, repaymentFreq, numberOfInstallments, disburseDate, gracePeriod = 0 } = input
  const years = numberOfInstallments / (PERIODS_PER_YEAR[repaymentFreq] || 12)
  const totalInterest = round2((principal * annualRate * years) / 100)
  const totalPayable = round2(principal + totalInterest)
  const installmentAmount = round2(totalPayable / numberOfInstallments)
  const principalPer = round2(principal / numberOfInstallments)
  const interestPer = round2(totalInterest / numberOfInstallments)

  const rows: ScheduleRow[] = []
  const startDate = new Date(disburseDate)
  if (gracePeriod > 0) startDate.setDate(startDate.getDate() + gracePeriod)

  let balance = principal
  for (let i = 1; i <= numberOfInstallments; i++) {
    // First installment due one period after start; subsequent periods add from start.
    const dueDate = addInterval(disburseDate, repaymentFreq, i)
    balance = round2(balance - principalPer)
    rows.push({
      installmentNo: i,
      dueDate,
      principal: principalPer,
      interest: interestPer,
      installmentAmount,
      balanceAfter: Math.max(balance, 0),
    })
  }
  return { rows, totalPrincipal: principal, totalInterest, totalPayable, installmentAmount }
}

// --- Reducing balance (standard amortization) ---
// Periodic rate = annualRate / periodsPerYear.
// EMI = P * r * (1+r)^n / ((1+r)^n - 1)
// Per row: interest = balance * r, principal = EMI - interest.
function generateReducingSchedule(input: ScheduleInput): ScheduleSummary {
  const { principal, annualRate, repaymentFreq, numberOfInstallments, disburseDate } = input
  const periodsPerYear = PERIODS_PER_YEAR[repaymentFreq] || 12
  const r = annualRate / 100 / periodsPerYear

  let installmentAmount: number
  if (r === 0) {
    installmentAmount = round2(principal / numberOfInstallments)
  } else {
    const pow = Math.pow(1 + r, numberOfInstallments)
    installmentAmount = round2((principal * r * pow) / (pow - 1))
  }

  const rows: ScheduleRow[] = []
  let balance = principal
  let totalInterest = 0

  for (let i = 1; i <= numberOfInstallments; i++) {
    const interest = round2(balance * r)
    let principalPart = round2(installmentAmount - interest)

    // Last installment: clear any rounding residual so balance hits exactly 0.
    if (i === numberOfInstallments) {
      principalPart = round2(balance)
    }

    // rowInstallment is derived from the (possibly residual-adjusted)
    // principal + interest so the row's installmentAmount matches what the
    // borrower actually pays that period.
    const rowInstallment = round2(principalPart + interest)

    balance = round2(balance - principalPart)
    totalInterest = round2(totalInterest + interest)

    rows.push({
      installmentNo: i,
      dueDate: addInterval(disburseDate, repaymentFreq, i),
      principal: principalPart,
      interest,
      installmentAmount: rowInstallment,
      balanceAfter: Math.max(balance, 0),
    })
  }

  const totalPayable = round2(principal + totalInterest)
  return { rows, totalPrincipal: principal, totalInterest, totalPayable, installmentAmount }
}

// Main entrypoint. Returns a normalized schedule (no Prisma types) so the same
// engine can be reused for client-side previews before a loan is saved.
export function generateSchedule(input: ScheduleInput): ScheduleSummary {
  const safeInstallments = Math.max(1, Math.floor(input.numberOfInstallments || 1))
  const safeInput: ScheduleInput = { ...input, numberOfInstallments: safeInstallments }

  if (input.interestType === "REDUCING") {
    return generateReducingSchedule(safeInput)
  }
  return generateFlatSchedule(safeInput)
}

// Build a manual schedule from admin-supplied rows (the product must allow manual schedules).
// Rows only need dueDate + installmentAmount; principal/interest are derived if absent.
export function generateManualSchedule(
  rows: { dueDate: Date; installmentAmount: number; principal?: number; interest?: number }[],
  principal: number
): ScheduleSummary {
  const sorted = [...rows].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  const out: ScheduleRow[] = []
  let balance = principal
  let totalInterest = 0

  sorted.forEach((row, i) => {
    let principalPart = row.principal ?? 0
    let interest = row.interest ?? 0
    // Default split: everything is principal unless interest is provided.
    if (!principal && !interest) {
      principalPart = row.installmentAmount
      interest = 0
    }
    if (i === sorted.length - 1) principalPart = Math.min(principalPart, balance)
    balance = round2(balance - principalPart)
    totalInterest = round2(totalInterest + interest)
    out.push({
      installmentNo: i + 1,
      dueDate: new Date(row.dueDate),
      principal: round2(principalPart),
      interest: round2(interest),
      installmentAmount: round2(row.installmentAmount),
      balanceAfter: Math.max(balance, 0),
    })
  })

  return {
    rows: out,
    totalPrincipal: principal,
    totalInterest,
    totalPayable: round2(principal + totalInterest),
    installmentAmount: out[0]?.installmentAmount ?? 0,
  }
}

// Estimate the expected close date from the last schedule row.
export function expectedCloseFromSchedule(rows: ScheduleRow[]): Date | null {
  if (!rows.length) return null
  return new Date(rows[rows.length - 1].dueDate)
}
