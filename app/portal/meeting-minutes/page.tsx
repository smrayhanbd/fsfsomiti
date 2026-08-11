import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTransparencySettings } from "@/app/actions/portal"
import MeetingMinutesClient from "./MeetingMinutesClient"

export const dynamic = "force-dynamic"

/**
 * Member portal → Meeting Minutes (read-only archive).
 *
 * Lists past meetings that have a `minutesUrl` attached. Members can download
 * / view the minutes PDF. Attendance internals and upload controls are not
 * shown here — purely a minutes archive. Gated by `showMeetingMinutes`.
 */
export default async function PortalMeetingMinutesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showMeetingMinutes) redirect("/portal")

  const now = new Date()

  const meetings = await prisma.meeting.findMany({
    where: {
      date: { lt: now },
      minutesUrl: { not: null },
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      date: true,
      type: true,
      location: true,
      link: true,
      minutesUrl: true,
      minutesFileName: true,
    },
  })

  const rows = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.date.toISOString(),
    type: m.type,
    location: m.location,
    link: m.link,
    minutesUrl: m.minutesUrl!,
    minutesFileName: m.minutesFileName,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Meeting Minutes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Archive of all recorded meeting minutes. Download or view any document.
          </p>
        </div>
        <Link
          href="/portal"
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <MeetingMinutesClient rows={rows} />
    </div>
  )
}
