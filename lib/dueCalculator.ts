import { Prisma } from "@prisma/client"

type FeeSetup = Prisma.FeeSetupGetPayload<Record<string, never>>

function stripTime(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** A payment row — the subset of the Savings model calculateDues consumes. */
export interface DuePayment {
  type: string
  amount: Prisma.Decimal | number
  date: Date
}

export function calculateDues(memberId: string, joinDate: Date, setups: FeeSetup[], payments: DuePayment[]) {
  let totalExpected = 0
  let totalFines = 0
  let totalPaid = 0
  
  const now = stripTime(new Date())
  const cleanJoinDate = stripTime(new Date(joinDate))

  for (const p of payments) {
    if (p.type !== "WITHDRAWAL") {
      totalPaid += Number(p.amount)
    }
  }

  const setupsByType: Record<string, FeeSetup[]> = {}
  for (const s of setups) {
    if (!setupsByType[s.name]) setupsByType[s.name] = []
    setupsByType[s.name].push(s)
  }

  for (const type in setupsByType) {
    const typeSetups = setupsByType[type].sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime())

    for (let i = 0; i < typeSetups.length; i++) {
      const setup = typeSetups[i]
      const nextSetup = typeSetups[i + 1]
      
      // --- TARGET MEMBER LOGIC ---
      if (setup.targetType === "SPECIFIC") {
        const ids = setup.targetMemberIds ? JSON.parse(setup.targetMemberIds) : []
        if (!ids.includes(memberId)) {
          continue // Skip this setup, it doesn't apply to this member
        }
      }

      const periodStart = stripTime(new Date(setup.effectiveDate))
      const periodEnd = nextSetup ? stripTime(new Date(nextSetup.effectiveDate)) : now

      if (periodStart > periodEnd) continue

      const currentCycle = new Date(periodStart.getTime())
      let safetyCounter = 0
      
      const isLastSetup = !nextSetup
      while (isLastSetup ? (currentCycle <= periodEnd) : (currentCycle < periodEnd)) {
        if (safetyCounter >= 1200) break
        safetyCounter++
        
        totalExpected += Number(setup.amount)
        
        const dueDate = new Date(currentCycle.getTime())
        const dueDay = Number(setup.dueDay)
        
        if (setup.frequency === "WEEKLY") {
          const dayDiff = (dueDay - dueDate.getDay() + 7) % 7
          dueDate.setDate(dueDate.getDate() + dayDiff)
        } 
        else if (setup.frequency === "MONTHLY") {
          const daysInMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()
          dueDate.setDate(Math.min(dueDay, daysInMonth))
        } 
        else {
          dueDate.setDate(dueDate.getDate() + dueDay)
        }

        const cleanDueDate = stripTime(dueDate)

        if (setup.hasFine && now > cleanDueDate && cleanDueDate >= cleanJoinDate) {
          totalFines += Number(setup.fineAmount || 0)
        }

        if (setup.frequency === "WEEKLY") currentCycle.setDate(currentCycle.getDate() + 7)
        else if (setup.frequency === "MONTHLY") currentCycle.setMonth(currentCycle.getMonth() + 1)
        else if (setup.frequency === "QUARTERLY") currentCycle.setMonth(currentCycle.getMonth() + 3)
        else if (setup.frequency === "HALF_YEARLY") currentCycle.setMonth(currentCycle.getMonth() + 6)
        else if (setup.frequency === "YEARLY") currentCycle.setFullYear(currentCycle.getFullYear() + 1)
        else break
      }
    }
  }

  const totalDue = (totalExpected + totalFines) - totalPaid
  
  return {
    totalExpected,
    totalFines,
    totalPaid,
    totalDue: totalDue > 0 ? totalDue : 0 
  }
}