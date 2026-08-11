import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import MemberProfileEditForm from "./MemberProfileEditForm"

export const dynamic = "force-dynamic"

/**
 * Member Portal → My Profile → Edit.
 *
 * Loads the signed-in member (with addresses, nominees and documents) and
 * hands a plain-serialized copy to the client edit form. Edits are submitted
 * as a PENDING `ProfileUpdateRequest` — they never touch the member record
 * until an admin approves them. See `submitFullProfileUpdateRequest` /
 * `approveProfileUpdateRequest` in `app/actions/portal.ts`.
 */
export default async function EditProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    include: { addresses: true, nominees: true, documents: true },
  })

  if (!member) redirect("/portal/profile")

  return <MemberProfileEditForm member={plain(member)} />
}
