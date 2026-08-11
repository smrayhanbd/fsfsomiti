import type { Metadata } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import Providers from "@/components/Providers"
import { DEFAULT_ORG, getOrganization } from "@/lib/organization"
// next-intl: provides `useTranslations` to client components + SSR messages
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

// The root layout's generateMetadata reads the Organization row from the DB.
// Force-dynamic (like every other segment in this app) so Next.js never tries
// to statically prerender the root / `_not-found` at BUILD time — that would
// invoke generateMetadata during `next build` and crash on any DB error.
export const dynamic = "force-dynamic"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
})

// Dynamic metadata — the browser-tab title and SEO description follow the
// saved Organization identity. Falls back to the generic defaults when the
// singleton row is missing OR the DB is unreachable (e.g. a transient pool
// error), so metadata never becomes a fatal page error.
export async function generateMetadata(): Promise<Metadata> {
  let org = DEFAULT_ORG
  try {
    org = await getOrganization()
  } catch {
    // Degrade gracefully — use defaults instead of failing the response.
  }
  return {
    title: `${org.name} — Savings Cooperative Management`,
    description: org.description || "Enterprise-grade management for Savings Societies and Cooperatives",
    // PWA manifest (Roadmap item 29). The manifest lives at /public/manifest.json
    // and references icon-192.png / icon-512.png in /public — these are
    // placeholder paths; drop real PNG icons into /public to enable the
    // install prompt and home-screen icon.
    manifest: "/manifest.json",
    // Web app theme colour — used by Android Chrome for the status bar tint
    // and by iOS Safari for the apple-touch-title bar. Mirrors manifest.json.
    themeColor: "#C9A84C",
    // Apple-specific — iOS doesn't honour manifest.json's `display: standalone`
    // without these tags, so the user gets an ugly browser chrome at the top.
    appleWebApp: {
      capable: true,
      title: org.name || "Somiti MS",
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: "/icon-192.png",
      apple: "/icon-192.png",
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // next-intl: load the locale + messages for the current request so client
  // components can call `useTranslations()` without an extra round-trip.
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={`${inter.variable} ${jakarta.variable} font-sans antialiased`}>
        {/* Anti-FOUC theme init is handled by next-themes' ThemeProvider
            (in components/Providers), which injects its own synchronous
            inline script into the server-rendered HTML. That built-in script
            sets the theme class before first paint, so no manual <Script>
            is needed here. Avoiding next/script in the layout also clears
            the React 19 "Encountered a script tag" warning. */}
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
