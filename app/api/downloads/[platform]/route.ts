import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/downloads/[platform]   (platform: "android" | "windows")
 *
 * Public download endpoint for the landing page's "Download Software"
 * section. The admin uploads .apk / .exe installers from the Landing Page
 * Content settings; those are stored on Cloudinary as EXTENSION-LESS raw
 * files (Cloudinary rejects executable extensions at upload time —
 * "resources with extension apk are not allowed"), so we can't link the
 * Cloudinary URL directly: the browser would save a file with no extension.
 *
 * This route streams the stored bytes through with a proper
 * Content-Disposition filename ("SomitiMS-Android-<version>.apk" /
 * "SomitiMS-Setup-<version>.exe"). Being same-origin also makes the anchor's
 * `download` attribute effective.
 */
const PLATFORMS = {
  android: {
    urlField: "androidAppUrl",
    versionField: "androidAppVersion",
    fileBase: "SomitiMS-Android",
    ext: "apk",
  },
  windows: {
    urlField: "windowsAppUrl",
    versionField: "windowsAppVersion",
    fileBase: "SomitiMS-Setup",
    ext: "exe",
  },
} as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const conf = PLATFORMS[platform as keyof typeof PLATFORMS]
  if (!conf) {
    return NextResponse.json({ error: "Unknown platform." }, { status: 404 })
  }

  const content = await prisma.siteContent.findUnique({
    where: { id: "singleton" },
  })
  const url = content?.[conf.urlField]
  if (!url) {
    return NextResponse.json(
      { error: "No release has been uploaded for this platform." },
      { status: 404 }
    )
  }

  // Version label goes into the filename — strip anything filename-hostile.
  const version = (content?.[conf.versionField] || "latest")
    .replace(/[^a-zA-Z0-9.-]/g, "")
    .replace(/^[-.]+|[-.]+$/g, "")
  const fileName = `${conf.fileBase}-${version || "latest"}.${conf.ext}`

  const upstream = await fetch(url, { cache: "no-store" })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "The stored file could not be fetched. Please try again later." },
      { status: 502 }
    )
  }

  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "public, max-age=3600",
  })
  const length = upstream.headers.get("content-length")
  if (length) headers.set("Content-Length", length)

  return new Response(upstream.body, { headers })
}
