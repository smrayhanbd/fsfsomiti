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
      className={`card-premium card-premium-hover group relative overflow-hidden p-4 ${className}`}
      style={{ ["--accent" as string]: color }}
    >
      {/* Accent glow */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition-transform duration-500 ease-out group-hover:scale-150"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-overline text-muted-ink">{label}</p>
          <p className="t-h2 t-num mt-1 truncate text-primary-ink">{value}</p>
          {hint && <p className="t-caption mt-1 text-muted-ink truncate">{hint}</p>}
          {trend && (
            <div
              className={`mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                trend.positive ? "text-success" : "text-debit"
              }`}
            >
              {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trend.value}%
            </div>
          )}
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border"
          style={{
            backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
            borderColor: `color-mix(in oklch, ${color} 32%, transparent)`,
            color,
          }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  )
}
