"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { LanguageProvider } from "@/components/somiti/LanguageProvider"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* React 19 warns "Encountered a script tag" when a component renders a
          raw <script> (next-themes injects one for anti-FOUC theme init).
          Passing the type through `scriptProps` makes it `text/javascript` on
          the server (executes before paint) and `text/plain` on the client
          (ignored on re-render), with suppressHydrationWarning bridging the
          mismatch. This is the pattern from the Next.js "Preventing Flash"
          guide. next-themes spreads scriptProps into its <script>, so `type`
          lands on the element. */}
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "text/plain" }}
      >
        <LanguageProvider>
          {children}
          {/* Mounted once at the app root so every toast.*() call has a renderer. */}
          <Toaster position="top-center" richColors closeButton />
        </LanguageProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
