/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { listCommittees } from "@/app/actions/elections"
import { History } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function CommitteesHistoryPage() {
  const committees = (await listCommittees()) as any[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-6 w-6 text-indigo-600" /> Committee History
        </h1>
        <p className="text-sm text-slate-500 mt-1">Past and present executive committees.</p>
      </div>

      {committees.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-slate-500">No committees on record.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {committees.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(c.termStartDate).toLocaleDateString()} → {new Date(c.termEndDate).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{c._count?.members || 0} member(s)</p>
                </div>
                <Badge variant="outline">{c.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
