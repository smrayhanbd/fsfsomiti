"use client"

/**
 * LanguageToggle — pill that switches the UI between English (EN) and
 * Bengali (BN). Default is English. Reads/writes choice via LanguageProvider.
 */
import { Languages } from "lucide-react"
import { useLanguage } from "@/components/somiti/LanguageProvider"

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, toggle } = useLanguage()
  const isBn = lang === "bn"

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isBn ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
        title={isBn ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
      >
        <span className="text-[11px] font-bold tracking-wide">{isBn ? "EN" : "বাং"}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isBn ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
      title={isBn ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--border-base)] px-2.5 text-xs font-semibold text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
    >
      <Languages className="h-4 w-4" />
      <span>{isBn ? "বাংলা" : "English"}</span>
    </button>
  )
}
