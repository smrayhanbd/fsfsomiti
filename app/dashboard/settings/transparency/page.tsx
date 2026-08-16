import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import TransparencySettingsClient from "./TransparencySettingsClient"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

/**
 * Somiti Settings → Transparency Settings.
 *
 * Backs the singleton TransparencySettings row: per-feature on/off toggles for
 * the member-portal transparency modules (Bank Statement, Investments,
 * Projects, Meeting Minutes) plus the somiti's bank iBanking credentials.
 *
 * Like the Mail/SMS settings pages, the iBanking password is NEVER sent to the
 * client — only a boolean `ibankingPasswordHas` so the form can show whether a
 * password is already stored. The password field is encrypted at rest and the
 * save action preserves it when submitted blank.
 */
export default async function TransparencySettingsPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("System & Settings", "Transparency Settings")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const settings = await prisma.transparencySettings.findUnique({ where: { id: "singleton" } })

  return (
    <TransparencySettingsClient
      settings={{
        showBankStatement: settings?.showBankStatement ?? true,
        showInvestments: settings?.showInvestments ?? true,
        showProjects: settings?.showProjects ?? true,
        showMeetingMinutes: settings?.showMeetingMinutes ?? true,
        bankName: settings?.bankName ?? "",
        ibankingUrl: settings?.ibankingUrl ?? "",
        ibankingUserId: settings?.ibankingUserId ?? "",
        ibankingPasswordHas: !!settings?.ibankingPasswordEnc,
        bankInstructions: settings?.bankInstructions ?? "",
      }}
    />
  )
}
