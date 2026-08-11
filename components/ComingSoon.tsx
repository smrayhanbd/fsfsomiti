import { Card, CardContent } from "@/components/ui/card"
import { Construction } from "lucide-react"

export default function ComingSoon({ title, description }: { title: string, description: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{description}</p>
      </div>
      
      <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-full bg-amber-50 dark:bg-amber-950/40 mb-6 ring-4 ring-white dark:ring-slate-900 shadow-lg">
            <Construction className="h-12 w-12 text-amber-500" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Module Under Construction</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm">
            The UI and backend logic for this module are currently being developed. You can seamlessly navigate the rest of the system while we build this out!
          </p>
        </CardContent>
      </Card>
    </div>
  )
}