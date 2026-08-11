"use client"

/**
 * DashboardCharts — Recharts-powered financial visualizations for the
 * executive dashboard. Token-driven colours (no rainbow). Kept client-side
 * because Recharts measures the DOM.
 *
 * All three charts share a consistent look: smooth curves, subtle grid,
 * minimal axis labels, on-brand tooltip. Data is passed in from the server
 * page so this component stays presentational.
 */
import React from "react"
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts"
import { formatBDT } from "@/components/somiti/Money"

export interface TrendPoint { label: string; value: number }
export interface LoanRecoverySlice { name: string; value: number; color: string }

const axisTick = { fontSize: 11, fill: "var(--text-muted)" }

/** Minimal shape of a Recharts tooltip payload entry (only what we read). */
interface TooltipEntry {
  name?: string | number
  value?: string | number
  color?: string
  payload?: { color?: string }
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
}

/** Soft, on-brand tooltip used by every chart. */
function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-elevated px-3 py-2 shadow-lift">
      {label && <p className="t-caption mb-1 font-semibold text-primary-ink">{label}</p>}
      {payload.map((p, i) => {
        // The "No Loans Yet" placeholder slice has value 1 purely so Recharts
        // renders a ring — display ৳ 0 in the tooltip to reflect reality.
        const displayValue = p.name === "No Loans Yet" ? 0 : Number(p.value)
        return (
          <p key={i} className="t-num t-caption flex items-center gap-1.5 text-secondary-ink">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.payload?.color }} />
            {p.name}: <span className="font-semibold text-primary-ink">{formatBDT(displayValue)}</span>
          </p>
        )
      })}
    </div>
  )
}

/** Savings growth — smooth area chart. */
export function SavingsGrowthChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-blue)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-blue)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--chart-blue)", strokeWidth: 1, strokeDasharray: "4 4" }} />
        <Area
          type="monotone"
          dataKey="value"
          name="Savings"
          stroke="var(--chart-blue)"
          strokeWidth={2.5}
          fill="url(#savingsFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Collection trend — vertical bars across recent months. */
export function CollectionTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-base)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--control-bg)" }} />
        <Bar dataKey="value" name="Collected" radius={[6, 6, 0, 0]} maxBarSize={36}>
          {data.map((_, i) => (
            <Cell key={i} fill="var(--chart-violet)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Loan recovery — donut of recovered vs outstanding. */
export function LoanRecoveryDonut({ data }: { data: LoanRecoverySlice[] }) {
  const rawTotal = data.reduce((s, d) => s + d.value, 0)
  // When the only slice is the "No Loans Yet" placeholder (value: 1), display
  // ৳ 0 as the total instead of ৳ 1. The placeholder value of 1 is needed so
  // Recharts renders a full neutral ring — but the displayed amount must
  // reflect reality (no money recovered because there are no loans).
  const isPlaceholder = data.length === 1 && data[0].name === "No Loans Yet"
  const total = isPlaceholder ? 0 : rawTotal
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={3}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre label */}
      <div className="pointer-events-none absolute inset-x-0 top-[42%] flex -translate-y-1/2 flex-col items-center">
        <span className="t-overline text-muted-ink">{isPlaceholder ? "No Loans" : "Total"}</span>
        <span className="t-num t-subheading text-primary-ink">{formatBDT(total)}</span>
      </div>
    </div>
  )
}
