/**
 * next-intl server-side request config (Roadmap item 26).
 *
 * Loads the right message bundle based on the `locale` cookie (set by the
 * LanguageToggle). Defaults to English when no cookie is set.
 */
import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

export const locales = ["en", "bn"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("locale")?.value
  const locale: Locale =
    cookieLocale && (locales as readonly string[]).includes(cookieLocale)
      ? (cookieLocale as Locale)
      : defaultLocale
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
