/**
 * Convert a non-negative number into English words, formatted for currency
 * vouchers: e.g. `numberToWords(1530)` → "One Thousand Five Hundred Thirty".
 *
 * Supports up to crores (Bangladeshi numbering — lakh/crore isn't used; the
 * Western scale is fine for receipt wording). Returns "Zero" for 0.
 *
 * No external dependency — small self-contained helper used by money receipts.
 */
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
]

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
]

const SCALES = [
  { value: 1_000_000_000, label: "Billion" },
  { value: 1_000_000, label: "Million" },
  { value: 1_000, label: "Thousand" },
  { value: 100, label: "Hundred" },
]

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return TENS[tens] + (ones ? " " + ONES[ones] : "")
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  let out = ""
  if (hundreds) out += ONES[hundreds] + " Hundred"
  if (rest) out += (hundreds ? " " : "") + twoDigits(rest)
  return out
}

export function numberToWords(num: number): string {
  if (!Number.isFinite(num) || num < 0) return ""
  if (num === 0) return "Zero"

  let intPart = Math.floor(num)
  const fracPart = Math.round((num - intPart) * 100)

  let words = ""
  for (const scale of SCALES) {
    if (intPart >= scale.value) {
      const chunk = Math.floor(intPart / scale.value)
      words += (words ? " " : "") + threeDigits(chunk) + " " + scale.label
      intPart -= chunk * scale.value
    }
  }
  if (intPart > 0) {
    words += (words ? " " : "") + threeDigits(intPart)
  }

  // Append the paisa (cents) part only when non-zero.
  if (fracPart > 0) {
    words += " and " + twoDigits(fracPart) + " Paisa"
  }
  return words
}

/**
 * Full BDT amount-in-words string for a voucher: "Taka One Thousand Five
 * Hundred Thirty Only". Returns "Taka Zero Only" for 0.
 */
export function amountInWordsBDT(amount: number): string {
  return `Taka ${numberToWords(amount)} Only`
}
