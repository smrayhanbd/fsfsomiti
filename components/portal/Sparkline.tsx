"use client"

import { useMemo } from "react"

interface SparklineProps {
  data: { label: string; value: number }[]
  height?: number
  className?: string
}

// Lightweight inline SVG sparkline + bar chart for savings trends.
// No external chart dependency. Renders bars scaled to the max value.
export default function Sparkline({ data, height = 56, className }: SparklineProps) {
  const { bars, max } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.value))
    return { bars: data, max }
  }, [data])

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
        No data yet
      </div>
    )
  }

  const barGap = 6
  const barWidth = `calc((100% - ${(bars.length - 1) * barGap}px) / ${bars.length})`

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 w-full" style={{ height }}>
        {bars.map((d, i) => {
          const pct = (d.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
              <div className="relative w-full flex items-end" style={{ height }}>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-indigo-200 to-indigo-500 dark:from-indigo-900/60 dark:to-indigo-500 transition-all duration-300 group-hover:from-indigo-300 group-hover:to-indigo-600"
                  style={{ height: `${Math.max(pct, 3)}%` }}
                  title={`${d.label}: ৳ ${d.value.toLocaleString()}`}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {bars.map((d, i) => (
          <div key={i} style={{ width: barWidth }} className="text-center">
            <span className="text-[10px] text-slate-400 font-medium">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
