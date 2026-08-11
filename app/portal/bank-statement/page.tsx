import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { decrypt } from "@/lib/crypto"
import { getTransparencySettings } from "@/app/actions/portal"
import BankStatementClient from "./BankStatementClient"

export const dynamic = "force-dynamic"

/**
 * Member portal → Bank Statement.
 *
 * Shows the somiti fund's iBanking credentials so a member can log in to the
 * bank portal and view the statement themselves. The password is decrypted
 * server-side here only (never stored client-side beyond the rendered value),
 * mirroring how the org logo / receipt data flows from server → client.
 *
 * Gated by the admin's `showBankStatement` toggle (Transparency Settings).
 */
export default async function BankStatementPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showBankStatement) redirect("/portal")

  const settings = await prisma.transparencySettings.findUnique({ where: { id: "singleton" } })

  const ibankingPassword = settings?.ibankingPasswordEnc ? decrypt(settings.ibankingPasswordEnc) : ""

  return (
    <BankStatementClient
      bankName={settings?.bankName ?? null}
      ibankingUrl={settings?.ibankingUrl ?? null}
      ibankingUserId={settings?.ibankingUserId ?? null}
      ibankingPassword={ibankingPassword}
      bankInstructions={settings?.bankInstructions ?? null}
    />
  )
}
