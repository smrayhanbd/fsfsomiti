import { NextResponse, type NextRequest } from "next/server"
import { verifyCronRequest } from "@/lib/cron"
import { sendSpecialWishesForDate } from "@/lib/specialWishes"

// Cron endpoint — sends birthday, marriage anniversary, joining anniversary,
// and festival wishes to all active members.
//
// Schedule DAILY via an external scheduler (Inngest, GitHub Actions, etc.).
// Auth: CRON_SECRET — fail-closed if not set.

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const summary = await sendSpecialWishesForDate()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Wish sender error:", error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
