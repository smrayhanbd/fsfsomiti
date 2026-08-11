/**
 * next-intl navigation helpers (Roadmap item 26).
 *
 * Drop-in replacements for next/link + next/navigation that are locale-aware.
 * Components using `Link` from `@/i18n/navigation` automatically get the
 * right locale prefix in their href.
 */
import { createNavigation } from "next-intl/navigation"
import { routing } from "./routing"

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
