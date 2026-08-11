import prisma from "@/lib/prisma"
import { PERMISSIONS, isSuperAdmin } from "@/lib/permissions"
import { resolveCurrentUser } from "@/app/actions/meeting"
import MeetingsClient from "./MeetingsClient"

export const dynamic = "force-dynamic"

// Active members eligible to attend a given meeting. Rule 7:
//   - exclude INACTIVE / SUSPENDED (only ACTIVE shown)
//   - exclude members whose join date is after the meeting date
//     (joiningDate falls back to membershipDate when null)
function eligibleMembersFor(
  members: { id: string; fullName: string; memberNo: string; joiningDate: Date | null; membershipDate: Date }[],
  meetingDate: Date
) {
  return members
    .filter((m) => {
      const join = m.joiningDate ?? m.membershipDate
      return join.getTime() <= meetingDate.getTime()
    })
    .map((m) => ({ id: m.id, fullName: m.fullName, memberNo: m.memberNo }))
}

export default async function MeetingsPage() {
  const now = new Date()

  const [meetings, members, currentUser, usersWithRoles, allPermissions] = await Promise.all([
    prisma.meeting.findMany({
      orderBy: { date: "desc" },
      include: { attendances: { select: { memberId: true, status: true } } },
    }),
    // Rule 7 part 1: only ACTIVE members are ever eligible.
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, memberNo: true, joiningDate: true, membershipDate: true },
      orderBy: { fullName: "asc" },
    }),
    resolveCurrentUser(),
    prisma.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { email: "asc" },
    }),
    prisma.userPermission.findMany({ select: { userId: true, permission: true } }),
  ])

  const superAdmin = isSuperAdmin(currentUser)

  // Permission grant lookup → userId → Set<permission>
  const permMap = new Map<string, Set<string>>()
  for (const p of allPermissions) {
    if (!permMap.has(p.userId)) permMap.set(p.userId, new Set())
    permMap.get(p.userId)!.add(p.permission)
  }

  // Split by date into Upcoming / Past (rule 3).
  type SerializedMeeting = {
    id: string
    title: string
    date: string
    type: string
    location: string | null
    link: string | null
    agenda: string
    createdAt: string
    attendanceLocked: boolean
    minutesUrl: string | null
    minutesFileName: string | null
    minutesLocked: boolean
    members: { id: string; fullName: string; memberNo: string }[]
    attendances: { memberId: string; status: "PRESENT" | "ABSENT" | "EXCUSED" }[]
  }

  const serialize = (m: typeof meetings[number]): SerializedMeeting => ({
    id: m.id,
    title: m.title,
    date: m.date.toISOString(),
    type: m.type,
    location: m.location,
    link: m.link,
    agenda: m.agenda,
    createdAt: m.createdAt.toISOString(),
    attendanceLocked: m.attendanceLocked,
    minutesUrl: m.minutesUrl,
    minutesFileName: m.minutesFileName,
    minutesLocked: m.minutesLocked,
    members: eligibleMembersFor(members, m.date),
    attendances: m.attendances.map((a) => ({
      memberId: a.memberId,
      status: a.status as "PRESENT" | "ABSENT" | "EXCUSED",
    })),
  })

  const upcoming = meetings.filter((m) => m.date.getTime() >= now.getTime()).map(serialize)
  const past = meetings.filter((m) => m.date.getTime() < now.getTime()).map(serialize)

  return (
    <MeetingsClient
      upcoming={upcoming}
      past={past}
      isSuperAdmin={superAdmin}
      adminUsers={usersWithRoles.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        canMarkAttendance: permMap.get(u.id)?.has(PERMISSIONS.MEETING_ATTENDANCE_MARK) ?? false,
        canUploadMinutes: permMap.get(u.id)?.has(PERMISSIONS.MEETING_MINUTES_UPLOAD) ?? false,
      }))}
    />
  )
}
