"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Printer } from "lucide-react"

/**
 * Compact date filter used by the financial-statement pages. Pushes `from` and
 * `to` (or just `asOf`) into the URL as query params so the server page can
 * re-fetch and re-render.
 */
export default function DateFilterBar({
  basePath,
  from,
  to,
  asOf,
  mode = "range",
}: {
  basePath: string
  from?: string | null
  to?: string | null
  asOf?: string | null
  mode?: "range" | "asOf"
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [fromVal, setFromVal] = useState(from || "")
  const [toVal, setToVal] = useState(to || "")
  const [asOfVal, setAsOfVal] = useState(asOf || "")

  const apply = () => {
    const params = new URLSearchParams()
    if (mode === "range") {
      if (fromVal) params.set("from", fromVal)
      if (toVal) params.set("to", toVal)
    } else {
      if (asOfVal) params.set("asOf", asOfVal)
    }
    startTransition(() => router.push(`${basePath}?${params.toString()}`))
  }

  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
      <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-end">
        {mode === "range" ? (
          <>
            <div className="flex-1 space-y-1.5 w-full">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                From
              </Label>
              <Input
                type="date"
                value={fromVal}
                onChange={(e) => setFromVal(e.target.value)}
                className="bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex-1 space-y-1.5 w-full">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                To
              </Label>
              <Input
                type="date"
                value={toVal}
                onChange={(e) => setToVal(e.target.value)}
                className="bg-white dark:bg-slate-950"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              As of date
            </Label>
            <Input
              type="date"
              value={asOfVal}
              onChange={(e) => setAsOfVal(e.target.value)}
              className="bg-white dark:bg-slate-950"
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            onClick={apply}
            disabled={isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Search className="mr-2 h-4 w-4" /> Generate
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
