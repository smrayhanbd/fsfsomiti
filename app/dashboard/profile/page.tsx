import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProfileClient from "./ProfileClient"

export const dynamic = "force-dynamic"

/**
 * Self-service admin profile.
 *
 * Shows the signed-in admin's account (name, email, phone, role) and lets them
 * edit name/phone and change their password. Email is read-only here — see
 * app/actions/profile.ts for why.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, phone: true, role: true, lastLogin: true },
  })
  if (!me) redirect("/")

  return (
    <ProfileClient
      initial={{
        name: me.name ?? "",
        email: me.email,
        phone: me.phone ?? "",
        role: me.role,
        lastLogin: me.lastLogin?.toISOString() ?? null,
      }}
    />
  )
}
