import { getSpec } from "@/lib/openapi/spec"

export const dynamic = "force-dynamic"

export function GET() {
  return Response.json(getSpec(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
