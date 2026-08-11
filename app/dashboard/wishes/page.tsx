import prisma from "@/lib/prisma"
import { getUpcomingWishes } from "@/lib/specialWishes"
import { getWishStats, getWishLogs } from "@/app/actions/wishes"
import WishesClient from "./WishesClient"

export const dynamic = "force-dynamic"

export default async function WishesPage() {
  // Fetch initial data server-side
  const [festivals, upcomingWishes, stats, logData] = await Promise.all([
    prisma.festival.findMany({ orderBy: [{ month: "asc" }, { day: "asc" }] }),
    getUpcomingWishes(30),
    getWishStats(),
    getWishLogs(1, 20),
  ])

  return (
    <WishesClient
      initialFestivals={JSON.parse(JSON.stringify(festivals))}
      upcomingWishes={JSON.parse(JSON.stringify(upcomingWishes))}
      initialStats={stats}
      initialLogs={logData.logs}
      totalLogs={logData.total}
    />
  )
}
