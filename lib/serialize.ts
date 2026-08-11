/**
 * Serialization helpers for passing Prisma data from Server Components to
 * Client Components.
 *
 * Next.js requires that props crossing the Server→Client boundary be "plain"
 * (JSON-serializable). Prisma returns a few non-serializable types that break
 * this contract and throw at runtime:
 *
 *   "Only plain objects can be passed to Client Components from Server
 *    Components. Decimal objects are not supported."
 *
 * The offending types are:
 *   - `Prisma.Decimal`  →  numbers have enough precision for currency display
 *   - `BigInt`          →  converted to Number (safe for the IDs/totals used here)
 *   - `Date`            →  ISO string (clients parse with `new Date(...)`)
 *
 * `plain()` walks an object/array and returns a deep-cloned, fully serializable
 * copy. Use it on any Prisma result you hand to a Client Component:
 *
 *   <MemberListClient members={plain(members)} />
 */
import { Prisma } from "@prisma/client"

type Plain<T> =
  T extends Prisma.Decimal | bigint ? number :
  T extends Date ? string :
  T extends (infer U)[] ? Plain<U>[] :
  T extends Map<unknown, unknown> | Set<unknown> ? Record<string, unknown> :
  T extends object ? { [K in keyof T]: Plain<T[K]> } :
  T

/** Recursively convert non-serializable Prisma/DB values into plain ones. */
export function plain<T>(value: T): Plain<T> {
  if (value instanceof Prisma.Decimal) {
    return Number(value) as Plain<T>
  }
  if (typeof value === "bigint") {
    return Number(value) as Plain<T>
  }
  if (value instanceof Date) {
    return value.toISOString() as Plain<T>
  }
  if (Array.isArray(value)) {
    return value.map(plain) as Plain<T>
  }
  if (value && typeof value === "object" && !(value instanceof RegExp) && !(value instanceof Error)) {
    // Avoid wrapping class instances other than the Prisma types handled above.
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = plain((value as Record<string, unknown>)[key])
    }
    return out as Plain<T>
  }
  return value as Plain<T>
}
