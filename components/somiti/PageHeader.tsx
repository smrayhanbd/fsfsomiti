/**
 * PageHeader — consistent page title block with actions.
 *
 * `title`/`subtitle` are language keys passed through the i18n `t()` helper
 * from LanguageProvider. Falls back to the literal string if no entry exists.
 */
"use client"
import React from "react"
import { useLanguage } from "@/components/somiti/LanguageProvider"

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Rendered on the trailing side (buttons, etc) */
  actions?: React.ReactNode
  /** Breadcrumb-ish overline shown above the title */
  overline?: string
  className?: string
}

export default function PageHeader({ title, subtitle, actions, overline, className = "" }: PageHeaderProps) {
  const { t } = useLanguage()
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {overline && (
          <p className="t-overline mb-1.5 text-brand">{overline}</p>
        )}
        <h1 className="t-h1 text-primary-ink">{t(title)}</h1>
        {subtitle && <p className="t-body mt-1.5 text-muted-ink">{t(subtitle)}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
