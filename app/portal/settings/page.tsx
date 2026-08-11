import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import SettingsClient from "./SettingsClient"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const memberId = session.user.id

  // Check if user already has a pending closing request
  const pendingClose = await prisma.memberRequest.findFirst({
    where: { memberId, type: "CLOSING", status: "PENDING" }
  })

  return <SettingsClient memberId={memberId} hasPendingClose={!!pendingClose} />
}