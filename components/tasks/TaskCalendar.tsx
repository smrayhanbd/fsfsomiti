"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TASK_STATUS_META } from "@/components/tasks/badges"
import type { TaskRow } from "@/app/actions/tasks"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface CalendarProps {
  tasks: TaskRow[]
  basePath: string
}

export default function TaskCalendar({ tasks, basePath }: CalendarProps) {
  const [cursor, setCursor] = useState(new Date())
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 6 }) // Saturday start (BD)
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 6 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const tasksByDay = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    if (!t.dueDate) continue
    const key = format(new Date(t.dueDate), "yyyy-MM-dd")
    const arr = tasksByDay.get(key) ?? []
    arr.push(t)
    tasksByDay.set(key, arr)
  }

  return (
    <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{format(cursor, "MMMM yyyy")}</h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="icon-sm" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold uppercase text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const dayTasks = tasksByDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          return (
            <div
              key={key}
              className={`min-h-[92px] rounded-lg border p-1.5 ${
                inMonth
                  ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  : "bg-slate-50/50 dark:bg-slate-800/20 border-slate-100 dark:border-slate-800/50"
              }`}
            >
              <div className={`text-xs mb-1 ${isToday(day) ? "inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white font-semibold" : "text-slate-500"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    href={`${basePath}/${t.id}`}
                    className={`block text-[10px] leading-tight px-1.5 py-0.5 rounded truncate ${TASK_STATUS_META[t.status]?.badge} hover:opacity-80`}
                    title={t.title}
                  >
                    <span className={`inline-block h-1 w-1 rounded-full mr-1 ${TASK_STATUS_META[t.status]?.dot}`} />
                    {t.title}
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-slate-400 px-1">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
