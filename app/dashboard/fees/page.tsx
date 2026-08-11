import prisma from "@/lib/prisma"
import FinesManager from "./FinesManager"

export const dynamic = "force-dynamic"

export default async function FeesPage() {
  const [members, fineTypes, fines] = await Promise.all([
    prisma.member.findMany({
      where: { status: { in: ["ACTIVE", "SUSPENDED", "INACTIVE"] } },
      select: { id: true, fullName: true, memberNo: true, phone: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.fineType.findMany({ orderBy: { typeName: "asc" } }),
    prisma.fine.findMany({
      include: {
        member: { select: { id: true, fullName: true, memberNo: true } },
        fineType: { select: { id: true, typeName: true, penaltyPoints: true } },
      },
      orderBy: { issuedDate: "desc" },
    }),
  ])

  // Serialize Decimals/Dates for the client component.
  const serialized = {
    members: members.map((m) => ({ ...m })),
    fineTypes: fineTypes.map((t) => ({
      id: t.id,
      typeName: t.typeName,
      penaltyPoints: t.penaltyPoints,
      isActive: t.isActive,
    })),
    fines: fines.map((f) => ({
      id: f.id,
      status: f.status,
      amount: Number(f.amount),
      issuedDate: f.issuedDate.toISOString(),
      resolvedDate: f.resolvedDate?.toISOString() ?? null,
      notes: f.notes,
      member: { ...f.member },
      fineType: { ...f.fineType },
    })),
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Fines & Penalties
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Issue fines, manage fine types, and track resolution. Penalties feed the member Trust Score FINE KPI.
        </p>
      </div>
      <FinesManager members={serialized.members} fineTypes={serialized.fineTypes} fines={serialized.fines} />
    </div>
  )
}
