"use client"

import * as React from "react"

/**
 * BulkActionBar — sticky bottom bar that appears when one or more rows are
 * selected in a list/table. Shows the selection count + a configurable set of
 * action buttons (e.g. Approve All, Export CSV, Delete).
 *
 * Designed to be wrapped by any list client that already tracks row selection
 * (via `@tanstack/react-table` or a plain Set<string>).
 *
 * Pure presentational — the parent owns the selection state and supplies the
 * `onAction` callbacks.
 */
export interface BulkAction {
  /** Stable key — used as the React `key`. */
  key: string
  label: string
  icon?: React.ReactNode
  /** Tone — controls button colour. */
  tone?: "default" | "primary" | "success" | "danger" | "outline"
  /** Disabled state — e.g. while a transition is pending. */
  disabled?: boolean
  /** Loading spinner state — replaces the icon when truthy. */
  loading?: boolean
  /** Click handler — receives the current selection (array of ids). */
  onClick?: (selectedIds: string[]) => void
}

interface Props {
  /** The ids currently selected. Empty array hides the bar. */
  selected: Set<string> | string[]
  actions: BulkAction[]
  /** Optional caption shown after the count. Defaults to "selected". */
  caption?: string
  /** Optional "Clear selection" handler — when omitted, the link is hidden. */
  onClear?: () => void
}

const toneClass: Record<NonNullable<BulkAction["tone"]>, string> = {
  default: "bg-slate-900 text-white hover:bg-slate-800",
  primary: "bg-brand text-white hover:bg-brand/90",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
}

export default function BulkActionBar({
  selected,
  actions,
  caption = "selected",
  onClear,
}: Props) {
  const ids = React.useMemo(
    () => (Array.isArray(selected) ? selected : Array.from(selected)),
    [selected]
  )
  const count = ids.length
  // Render the bar whenever there's a selection. A CSS transition on the
  // outer div (see className below) provides the slide-up effect without
  // needing deferred state — keeps the render path simple and lint-clean.
  const visible = count > 0

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-150 ${
        count > 0 ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-4xl px-4 pb-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lift backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-indigo-100 px-2 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {count}
            </span>
            <span className="text-slate-600 dark:text-slate-300">{caption}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={a.disabled || a.loading}
                onClick={() => a.onClick?.(ids)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  toneClass[a.tone ?? "default"]
                }`}
              >
                {a.loading ? (
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="opacity-25"
                    />
                    <path
                      fill="currentColor"
                      d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                      className="opacity-75"
                    />
                  </svg>
                ) : (
                  a.icon
                )}
                {a.label}
              </button>
            ))}
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="ml-1 text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
