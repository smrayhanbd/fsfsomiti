"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { useMounted } from "@/lib/useMounted"

export default function ThemeToggle() {
  const mounted = useMounted()
  const { theme, setTheme } = useTheme()

  // Prevent hydration mismatch
  if (!mounted) return null

  return (
    <button
      aria-label="Toggle Dark Mode"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}