/**
 * next-intl routing config (Roadmap item 26).
 *
 * Uses `localePrefix: "as-needed"` so the default locale (English) doesn't
 * get a `/en/` prefix in the URL, while Bengali gets `/bn/...`. This keeps
 * existing URLs working without redirects.
 */
import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["en", "bn"],
  defaultLocale: "en",
  localePrefix: "as-needed",
})
