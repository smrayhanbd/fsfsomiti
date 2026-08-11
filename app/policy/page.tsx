import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import PolicyClient from "./PolicyClient"

export const dynamic = 'force-dynamic'

export default async function PolicyPage() {
  const [content, org] = await Promise.all([
    prisma.siteContent.findUnique({ where: { id: "singleton" } }),
    getOrganization(),
  ])
  const policyContent = content?.policyContent || "No policy content available yet. Please check back later."

  return <PolicyClient content={policyContent} org={org} />
}