"use client"

import AccountSelect, { type FlatAccount } from "@/components/AccountSelect"

interface CashAccountSelectProps {
  accounts: FlatAccount[]
  value?: string
  onValueChange: (id: string) => void
  className?: string
  placeholder?: string
}

/**
 * Restricts AccountSelect to cash / bank / wallet accounts (spec §14).
 * Used by every Transactions Module form to pick the payment source or
 * destination.
 */
export default function CashAccountSelect({
  accounts,
  value,
  onValueChange,
  className,
  placeholder = "Select cash / bank / wallet",
}: CashAccountSelectProps) {
  const cashLike = accounts.filter(
    (a) => a.isCash || a.isBank || a.accountCode.startsWith("MOBILE-WALLETS")
  )
  return (
    <AccountSelect
      accounts={cashLike}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      postingOnly
      className={className}
      renderMeta={(a) =>
        a.currentBalance != null ? `৳ ${Number(a.currentBalance).toLocaleString()}` : undefined
      }
    />
  )
}
