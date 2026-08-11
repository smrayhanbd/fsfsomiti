"use client"

import { useTheme } from "next-themes"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Building2, ArrowRight, Sun, Moon } from "lucide-react"
import { useMounted } from "@/lib/useMounted"
import OrgLogo from "@/components/somiti/OrgLogo"
import type { OrgInfo } from "@/lib/organization"

function ThemeToggle() {
  const mounted = useMounted()
  const { theme, setTheme } = useTheme()

  if (!mounted) return null

  return (
    <button
      aria-label="Toggle Dark Mode"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

export default function PolicyClient({ content, org }: { content: string, org: OrgInfo }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-colors duration-300">

      {/* Navbar (Copied from Landing Page, minus center links) */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl transition-colors duration-300">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
              <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                <Building2 className="h-5 w-5" />
              </OrgLogo>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{org.name}</span>
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <Link href="/login"><Button variant="ghost" className="text-sm font-medium hidden sm:block">Login</Button></Link>
            <Link href="/register"><Button className="bg-indigo-600 hover:bg-indigo-700 text-sm font-medium shadow-md">Register <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          </div>
        </div>
      </header>

      {/* Policy Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-8">
          Somiti Policy & Terms
        </h1>
        <div className="prose dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed text-lg" dangerouslySetInnerHTML={{ __html: content }} />
      </main>

      {/* Footer (Copied from Landing Page) */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-12 transition-colors duration-300">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
              <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                <Building2 className="h-4 w-4" />
              </OrgLogo>
            </div>
            <span className="font-bold text-slate-900 dark:text-white">{org.name}</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} {org.name}. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/login" className="hover:text-slate-900 dark:hover:text-white">Login</Link>
            <Link href="/register" className="hover:text-slate-900 dark:hover:text-white">Register</Link>
            <Link href="/policy" className="hover:text-slate-900 dark:hover:text-white">Privacy Policy</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}