import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import { plain } from "@/lib/serialize"
import DepositProductsClient from "./DepositProductsClient"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * Admin → Deposit Products list page.
 *
 * Super admins can manage the rate sheet for term-deposit products here.
 * Other admins can view the list (read-only) but the client hides the
 * create/edit/delete buttons when isSuperAdmin is false.
 */
export default async function DepositProductsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/")

  const user = await getCurrentUser()
  if (!user) redirect("/")
  const canEdit = isSuperAdmin(user)

  const products = await prisma.depositProduct.findMany({
    orderBy: [{ status: "asc" }, { termMonths: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { deposits: true } },
    },
  })

  return (
    <DepositProductsClient
      products={plain(products)}
      canEdit={canEdit}
    />
  )
}
