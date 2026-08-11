/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation"
import { getBallot } from "@/app/actions/elections"
import BallotClient from "./BallotClient"

export const dynamic = "force-dynamic"

export default async function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ballot: any
  try {
    ballot = await getBallot(id)
  } catch (e: any) {
    // If the member isn't eligible, already voted, or voting isn't open, redirect
    // to the election detail with an error message in the query string.
    redirect(`/portal/elections/${id}?error=${encodeURIComponent(e.message || "Unable to load ballot.")}`)
  }
  return <BallotClient electionId={id} ballot={ballot} />
}
