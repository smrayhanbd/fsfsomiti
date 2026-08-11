/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation"
import { getNominationContext } from "@/app/actions/elections"
import NominateClient from "./NominateClient"

export const dynamic = "force-dynamic"

export default async function NominatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx: any
  try {
    ctx = await getNominationContext(id)
  } catch (e: any) {
    redirect(`/portal/elections/${id}?error=${encodeURIComponent(e.message || "Unable to load nomination form.")}`)
  }
  if (ctx.election.status !== "NOMINATION_OPEN") {
    redirect(`/portal/elections/${id}?error=${encodeURIComponent("Nominations are not currently open for this election.")}`)
  }
  if (!ctx.election.allowSelfNomination) {
    redirect(`/portal/elections/${id}?error=${encodeURIComponent("Self-nomination is not enabled for this election.")}`)
  }
  return <NominateClient ctx={ctx} />
}
