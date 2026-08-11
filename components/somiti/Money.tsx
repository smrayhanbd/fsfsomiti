/**
 * Money — Bangladeshi Taka formatting with South Asian number grouping.
 *
 * `formatBDT(1500)`      → "৳ 1,500"
 * `formatBDT(250000)`    → "৳ 2,50,000"
 * `formatBDT(12750000)`  → "৳ 1,27,50,000"
 *
 * Renders right-aligned tabular figures. Optional `signed` colour-codes the
 * value (emerald positive / crimson negative) per the financial UI rules.
 */
import React from "react"

const BDT = new Intl.NumberFormat("en-IN", {
  // en-IN already gives us the lakh/crore (South Asian) grouping.
  maximumFractionDigits: 0,
})

export function formatBDT(amount: number): string {
  if (!Number.isFinite(amount)) return "৳ 0"
  return `৳ ${BDT.format(Math.round(amount))}`
}

interface MoneyProps {
  amount: number
  /** Show the ৳ symbol. Default true. */
  symbol?: boolean
  /** Colour-code by sign (emerald +, crimson −). Default false. */
  signed?: boolean
  /** When true, renders "-৳ 1,000" for negatives instead of "(৳ 1,000)". */
  className?: string
}

export default function Money({ amount, symbol = true, signed = false, className = "" }: MoneyProps) {
  const prefix = symbol ? "৳ " : ""
  const isNeg = amount < 0
  const text = isNeg ? `${prefix}-${BDT.format(Math.abs(Math.round(amount)))}` : `${prefix}${BDT.format(Math.round(amount))}`

  if (signed) {
    return (
      <span className={`t-num font-semibold ${isNeg ? "t-num-neg" : "t-num-pos"} ${className}`}>
        {text}
      </span>
    )
  }
  return <span className={`t-num ${className}`}>{text}</span>
}
