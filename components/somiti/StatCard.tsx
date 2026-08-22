/**
 * StatCard — premium financial statistic card.
 *
 * Replaces the three different inline StatCard implementations scattered
 * across the dashboard and member pages. Token-driven, glass-surface,
 * with optional trend and accent ring. Hover lifts subtly (one of two
 * permitted micro-interactions per screen).
 */
import React from "react"
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react"

type Accent = "blue" | "violet" | "gold" | "emerald" | "crimson" | "amber" | "sky"

const ACCENT_VAR: Record<Accent, string> = {
  blue: "var(--chart-blue)",
  violet: "var(--chart-violet)",
  gold: "var(--chart-gold)",
  emerald: "var(--chart-emerald)",
  crimson: "var(--chart-crimson)",
  amber: "var(--status-warning)",
  sky: "var(--status-info)",
}

export interface StatCardProps {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  accent?: Accent
  hint?: string
  trend?: { value: number; positive: boolean }
  className?: string
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  accent = "blue",
  hint,
  trend,
  className = "",
}: StatCardProps) {
  const color = ACCENT_VAR[accent]
  return (
    <div
      className={`card-premium card-premium-hover group relative overflow-hidden p-3 sm:p-4 ${className}`}
      style={{ ["--accent" as string]: color }}
    >
      {/* Accent glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition-transform duration-500 ease-out group-hover:scale-150"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {/* Two-column grid: label + icon on row 1, figure below. On phones the
          figure (and hint) span BOTH columns so lakh/crore amounts get the
          full card width; from sm up it stays in the left column, matching
          the original flex layout exactly. The icon spans all rows so it
          never inflates any single row's height. */}
      <div className="relative grid grid-cols-[1fr_auto] items-start gap-x-2.5 sm:gap-x-3">
        <p className="t-overline min-w-0 truncate text-muted-ink">{label}</p>
        <div
          className="col-start-2 row-span-4 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-[10px] border sm:h-9 sm:w-9"
          style={{
            backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
            borderColor: `color-mix(in oklch, ${color} 32%, transparent)`,
            color,
          }}
        >
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </div>
        <p className="t-stat-value t-num col-span-2 mt-1 truncate text-primary-ink sm:col-span-1">{value}</p>
        {hint && <p className="t-caption mt-1 truncate text-muted-ink sm:col-span-1 col-span-2">{hint}</p>}
        {trend && (
          <div
            className={`col-span-2 mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold sm:col-span-1 ${
              trend.positive ? "text-success" : "text-debit"
            }`}
          >
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}%
          </div>
        )}
      </div>
    </div>
  )
}
