import { sendSMS } from "./sms"
import { sendEmail } from "./email"
import prisma from "./prisma"

export type WishEvent = {
  type: "BIRTHDAY" | "MARRIAGE" | "JOINING" | "FESTIVAL"
  date: string // ISO date of next occurrence (YYYY-MM-DD)
  title: string
  daysUntil: number
  recipient?: {
    id: string
    fullName: string
    phone: string
    email?: string | null
  }
  festival?: {
    id: string
    name: string
    message?: string | null
  }
}

export type WishSummary = {
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

// ---------- UTC date helpers ----------

function getUTCToday(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function getEventUTC(date: Date, year: number) {
  return new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()))
}

function sameUTCMonthDay(a: Date, b: Date) {
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}

function daysUntil(target: Date, ref = new Date()) {
  const today = getUTCToday(ref)
  const diff = target.getTime() - today.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getNextOccurrence(date: Date, ref = new Date()) {
  const today = getUTCToday(ref)
  let candidate = getEventUTC(date, today.getUTCFullYear())
  if (candidate.getTime() < today.getTime()) {
    candidate = getEventUTC(date, today.getUTCFullYear() + 1)
  }
  return candidate
}

// ---------- Message builders ----------

function buildMemberMessage(
  type: "BIRTHDAY" | "MARRIAGE" | "JOINING",
  fullName: string
) {
  const orgName = process.env.ORGANIZATION_NAME || "Future Savings Foundation"
  switch (type) {
    case "BIRTHDAY":
      return `Happy Birthday ${fullName}! Wishing you a wonderful year ahead from ${orgName}.`
    case "MARRIAGE":
      return `Happy Wedding Anniversary ${fullName}! May your journey together be filled with love and joy. - ${orgName}`
    case "JOINING":
      return `Happy Somiti Anniversary ${fullName}! Thank you for being a valued member of ${orgName}.`
  }
}

function buildFestivalMessage(festivalName: string, customMessage?: string | null) {
  const orgName = process.env.ORGANIZATION_NAME || "Future Savings Foundation"
  if (customMessage?.trim()) {
    return customMessage.replace(/\$\{name\}/g, festivalName).replace(/\$\{org\}/g, orgName)
  }
  return `Wishing you and your family a joyful ${festivalName} from ${orgName}.`
}

// ---------- Duplicate guard ----------

async function alreadySentToday(
  type: "BIRTHDAY" | "MARRIAGE" | "JOINING" | "FESTIVAL",
  target: Date,
  memberId?: string,
  festivalId?: string
) {
  const start = getUTCToday(target)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  const existing = await prisma.specialWishLog.findFirst({
    where: {
      type,
      status: "SENT",
      sentAt: { gte: start, lt: end },
      ...(memberId ? { memberId } : {}),
      ...(festivalId ? { festivalId } : {}),
    },
  })
  return !!existing
}

// ---------- Sending ----------

async function sendWish(
  type: "BIRTHDAY" | "MARRIAGE" | "JOINING" | "FESTIVAL",
  message: string,
  phone: string,
  email: string | null | undefined,
  memberId?: string,
  festivalId?: string
): Promise<{ sent: number; failed: number; error?: string }> {
  let sent = 0
  let failed = 0
  let lastError: string | undefined

  const logChannel = async (channel: "SMS" | "EMAIL", status: "SENT" | "FAILED", error?: string) => {
    await prisma.specialWishLog.create({
      data: {
        type,
        message,
        channel,
        status,
        error: error || null,
        memberId: memberId || null,
        festivalId: festivalId || null,
      },
    })
  }

  // SMS
  try {
    const smsRes = await sendSMS(phone, message)
    if (smsRes.status === "OK") {
      await logChannel("SMS", "SENT")
      sent++
    } else {
      await logChannel("SMS", "FAILED", smsRes.response)
      failed++
      lastError = `SMS to ${phone}: ${smsRes.response}`
      await prisma.notification.create({
        data: {
          type: "SMS_ERROR",
          title: `${type} wish SMS failed`,
          message: lastError,
        },
      })
    }
  } catch (err) {
    failed++
    lastError = `SMS to ${phone}: ${err instanceof Error ? err.message : String(err)}`
    await logChannel("SMS", "FAILED", lastError)
    await prisma.notification.create({
      data: {
        type: "SMS_ERROR",
        title: `${type} wish SMS failed`,
        message: lastError,
      },
    })
  }

  // Email
  if (email) {
    try {
      const subject =
        type === "FESTIVAL"
          ? "Special Greetings"
          : type === "BIRTHDAY"
          ? "Happy Birthday"
          : type === "MARRIAGE"
          ? "Happy Wedding Anniversary"
          : "Happy Somiti Anniversary"

      await sendEmail(
        email,
        subject,
        `<p>Dear Member,</p><p>${message}</p><p>Regards,<br>${process.env.ORGANIZATION_NAME || "Future Savings Foundation"}</p>`
      )
      await logChannel("EMAIL", "SENT")
      sent++
    } catch (err) {
      failed++
      lastError = `Email to ${email}: ${err instanceof Error ? err.message : String(err)}`
      await logChannel("EMAIL", "FAILED", lastError)
    }
  }

  return { sent, failed, error: lastError }
}

// ---------- Public API ----------

export async function sendSpecialWishesForDate(date?: Date): Promise<WishSummary> {
  const target = date ? getUTCToday(date) : getUTCToday()
  const summary: WishSummary = { sent: 0, failed: 0, skipped: 0, errors: [] }

  const activeMembers = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      marriageDate: true,
      joiningDate: true,
      membershipDate: true,
    },
  })

  const festivals = await prisma.festival.findMany({
    where: { isActive: true },
  })

  // Build a list of tasks: { type, member, festival? }
  const tasks: {
    type: "BIRTHDAY" | "MARRIAGE" | "JOINING" | "FESTIVAL"
    member: (typeof activeMembers)[0]
    festival?: { id: string; name: string; message: string | null }
  }[] = []

  for (const member of activeMembers) {
    if (member.dateOfBirth && sameUTCMonthDay(member.dateOfBirth, target)) {
      tasks.push({ type: "BIRTHDAY", member })
    }
    if (member.marriageDate && sameUTCMonthDay(member.marriageDate, target)) {
      tasks.push({ type: "MARRIAGE", member })
    }
    const joiningDate = member.joiningDate || member.membershipDate
    if (joiningDate && sameUTCMonthDay(joiningDate, target)) {
      tasks.push({ type: "JOINING", member })
    }
  }

  for (const festival of festivals) {
    if (
      festival.month === target.getUTCMonth() + 1 &&
      festival.day === target.getUTCDate()
    ) {
      for (const member of activeMembers) {
        tasks.push({ type: "FESTIVAL", member, festival })
      }
    }
  }

  for (const task of tasks) {
    const isFestival = task.type === "FESTIVAL"
    const duplicated = await alreadySentToday(
      task.type,
      target,
      task.member.id,
      isFestival ? task.festival!.id : undefined
    )
    if (duplicated) {
      summary.skipped++
      continue
    }

    const message = isFestival
      ? buildFestivalMessage(task.festival!.name, task.festival!.message)
      : buildMemberMessage(task.type as "BIRTHDAY" | "MARRIAGE" | "JOINING", task.member.fullName)

    const result = await sendWish(
      task.type,
      message,
      task.member.phone,
      task.member.email,
      task.member.id,
      isFestival ? task.festival!.id : undefined
    )

    summary.sent += result.sent
    summary.failed += result.failed
    if (result.error) summary.errors.push(result.error)
  }

  return summary
}

export async function getUpcomingWishes(days = 30): Promise<WishEvent[]> {
  const members = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      marriageDate: true,
      joiningDate: true,
      membershipDate: true,
    },
  })

  const festivals = await prisma.festival.findMany({
    where: { isActive: true },
  })

  const events: WishEvent[] = []

  for (const member of members) {
    const baseRecipient = {
      id: member.id,
      fullName: member.fullName,
      phone: member.phone,
      email: member.email,
    }

    if (member.dateOfBirth) {
      const next = getNextOccurrence(member.dateOfBirth)
      const until = daysUntil(next)
      if (until >= 0 && until <= days) {
        events.push({
          type: "BIRTHDAY",
          date: toISODateUTC(next),
          title: `${member.fullName}'s Birthday`,
          daysUntil: until,
          recipient: baseRecipient,
        })
      }
    }

    if (member.marriageDate) {
      const next = getNextOccurrence(member.marriageDate)
      const until = daysUntil(next)
      if (until >= 0 && until <= days) {
        events.push({
          type: "MARRIAGE",
          date: toISODateUTC(next),
          title: `${member.fullName}'s Wedding Anniversary`,
          daysUntil: until,
          recipient: baseRecipient,
        })
      }
    }

    const joiningDate = member.joiningDate || member.membershipDate
    if (joiningDate) {
      const next = getNextOccurrence(joiningDate)
      const until = daysUntil(next)
      if (until >= 0 && until <= days) {
        events.push({
          type: "JOINING",
          date: toISODateUTC(next),
          title: `${member.fullName}'s Somiti Anniversary`,
          daysUntil: until,
          recipient: baseRecipient,
        })
      }
    }
  }

  for (const festival of festivals) {
    const festivalDate = new Date(Date.UTC(new Date().getUTCFullYear(), festival.month - 1, festival.day))
    const next = getNextOccurrence(festivalDate)
    const until = daysUntil(next)
    if (until >= 0 && until <= days) {
      events.push({
        type: "FESTIVAL",
        date: toISODateUTC(next),
        title: festival.name,
        daysUntil: until,
        festival: { id: festival.id, name: festival.name, message: festival.message },
      })
    }
  }

  events.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
    return a.title.localeCompare(b.title)
  })

  return events
}
