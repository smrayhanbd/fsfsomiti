/**
 * SectionCard — the standard elevated container for grouped dashboard content.
 *
 * Premium glass surface, optional icon + title + subtitle header,
 * and an optional trailing action slot (e.g. "View all" links).
 *
 * Marked "use client" because it uses internal state/interactions.
 */
"use client"
import React from "react"

type Accent = "blue" | "violet" | "gold" | "emerald" | "crimson" | "amber"

const ACCENT_VAR: Record<Accent, string> = {
  blue: "var(--chart-blue)",
  violet: "var(--chart-violet)",
  gold: "var(--chart-gold)",
  emerald: "var(--chart-emerald)",
  crimson: "var(--chart-crimson)",
  amber: "var(--status-warning)",
}

interface SectionCardProps {
  /** A rendered icon element (e.g. <TrendingUp />), not the component type, so
   *  it stays serializable across the Server→Client boundary. */
  icon?: React.ReactNode
  title?: string
  subtitle?: string
  /** Rendered on the trailing side of the header. */
  action?: React.ReactNode
  accent?: Accent
  className?: string
  /** Padding for the body. Default "p-5". */
  bodyClassName?: string
  children: React.ReactNode
}

export default function SectionCard({
  icon,
  title,
  subtitle,
  action,
  accent = "blue",
  className = "",
  bodyClassName = "p-5",
  children,
}: SectionCardProps) {
  const color = ACCENT_VAR[accent]
  return (
    <section className={`card-premium flex flex-col ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-base)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border [&>svg]:h-[18px] [&>svg]:w-[18px]"
                style={{
                  backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
                  borderColor: `color-mix(in oklch, ${color} 32%, transparent)`,
                  color,
                }}
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="t-h3 truncate text-primary-ink">{title}</h2>}
              {subtitle && <p className="t-caption truncate text-muted-ink">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
