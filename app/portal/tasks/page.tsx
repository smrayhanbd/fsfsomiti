import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPortalMemberTasks } from "@/app/actions/tasks"
import TaskTable from "@/components/tasks/TaskTable"
import TaskKanban from "@/components/tasks/TaskKanban"
import { CheckSquare, LayoutGrid, ListChecks } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function PortalTasksPage() {
  const session = await getServerSession(authOptions)
  const memberId = session?.user?.id
  if (!memberId) return null

  const tasks = await getPortalMemberTasks(memberId)
  const openTasks = tasks.filter((t) => ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW"].includes(t.status))

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-indigo-600" /> My Tasks
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          You have <span className="font-semibold text-slate-700 dark:text-slate-200">{openTasks.length}</span> open task{openTasks.length !== 1 ? "s" : ""} assigned to you.
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <CheckSquare className="h-10 w-10 mx-auto mb-2 text-slate-300" />
          <p className="text-slate-500">No tasks assigned to you right now.</p>
          <Link href="/portal" className="mt-3 inline-block"><Button variant="outline">Back to Dashboard</Button></Link>
        </div>
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list"><ListChecks className="h-4 w-4 mr-1.5" /> List</TabsTrigger>
            <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1.5" /> Board</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4">
            <TaskTable tasks={tasks} basePath="/portal/tasks" emptyLabel="You have no visible tasks." />
          </TabsContent>
          <TabsContent value="kanban" className="mt-4">
            <TaskKanban tasks={tasks} basePath="/portal/tasks" />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
