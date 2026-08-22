import { v2 as cloudinary } from "cloudinary"

// Allowed upload types and the per-file size cap (10 MB).
const ALLOWED = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
} as const

const MAX_BYTES = 10 * 1024 * 1024

export interface SavedFile {
  /** Cloudinary secure URL (https://res.cloudinary.com/...). */
  url: string
  /** The original file name from the upload — preserved for display. */
  fileName: string
}

/**
 * Per-call overrides for saveUploadedFile.
 *
 * - `maxBytes` — raises/lowers the 10 MB default cap (e.g. software
 *   installers are far larger than document attachments).
 * - `allowedExtensions` — validates by FILE EXTENSION instead of the global
 *   MIME allow-list. Needed for binaries like .apk/.exe whose MIME type
 *   browsers report inconsistently (application/vnd.android.package-archive,
 *   application/x-msdownload, or the generic application/octet-stream).
 * - `resourceType` — the Cloudinary resource type. Defaults to "auto", but
 *   "auto" REJECTS unknown binary extensions (Cloudinary answers
 *   "resources with extension apk are not allowed") because it can't
 *   classify them as image or video. Installer uploads must pass "raw".
 */
export interface SaveFileOptions {
  maxBytes?: number
  allowedExtensions?: string[]
  resourceType?: "auto" | "raw" | "image" | "video"
}

// Configure Cloudinary lazily on first use so the module loads cleanly even
// when the env vars aren't set yet (e.g. during build). The actual upload
// will throw a clear error if the keys are missing at runtime.
let configured = false
function ensureConfigured() {
  if (configured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  configured = true
}

/**
 * Upload an uploaded File to Cloudinary and return its secure URL plus the
 * original file name.
 *
 * WHY CLOUDINARY (NOT DISK):
 * Vercel's serverless functions have a READ-ONLY filesystem — writing to
 * `public/uploads/...` throws `EROFS: read-only file system`. Cloudinary
 * (configured via CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET env vars)
 * stores the file in the cloud and returns a public HTTPS URL that works
 * identically in dev, preview, and production.
 *
 * The `subdir` arg (e.g. "deposit-slips", "tasks", "minutes") is mapped to a
 * Cloudinary folder so files stay organised in the media library. Rejects
 * unsupported types and oversize files. Callers are expected to have already
 * authorized the user.
 */
export async function saveUploadedFile(
  file: File,
  subdir: string,
  opts: SaveFileOptions = {}
): Promise<SavedFile> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  if (file.size > maxBytes) {
    throw new Error(`File is too large. Maximum size is ${Math.floor(maxBytes / (1024 * 1024))} MB.`)
  }

  if (opts.allowedExtensions) {
    // Extension-based validation — the caller knows exactly which binary
    // formats it expects (e.g. ["apk"] or ["exe"]).
    const ext = file.name.toLowerCase().split(".").pop() ?? ""
    if (!opts.allowedExtensions.includes(ext)) {
      throw new Error(
        `Unsupported file type. Allowed extensions: ${opts.allowedExtensions.map((e) => "." + e).join(", ")}.`
      )
    }
  } else {
    // Validate the file type. Same allow-list as before — if the browser didn't
    // send a MIME we fall back to the extension.
    const ext = ALLOWED[file.type as keyof typeof ALLOWED]
    if (!ext) {
      const fallback = file.name.toLowerCase().split(".").pop() ?? ""
      const safe = ["pdf", "doc", "docx", "txt", "png", "jpg", "jpeg", "webp", "gif", "xls", "xlsx", "zip"]
      if (!safe.includes(fallback)) {
        throw new Error("Unsupported file type. Allowed: PDF, DOC, DOCX, TXT, images (PNG/JPG/WEBP/GIF), XLS/XLSX, ZIP.")
      }
    }
  }

  ensureConfigured()

  // Convert the File to a Buffer for the Cloudinary stream upload.
  const buffer = Buffer.from(await file.arrayBuffer())

  // Use a folder hierarchy so the Cloudinary media library stays organized:
  //   future-savings/<subdir>/<uuid>
  // The public_id is a random UUID so the URL is unguessable (matching the
  // old disk-based scheme's crypto.randomUUID() behaviour).
  const crypto = await import("node:crypto")
  const publicId = `${subdir}/${crypto.randomUUID()}`

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: opts.resourceType ?? "auto",
        folder: "future-savings",
        public_id: publicId,
        // Overwrite the filename in Cloudinary's metadata so the original
        // name is preserved for download links (we also return it below).
        // EXCEPT for "raw" resources: Cloudinary blocklists executable
        // extensions (.apk/.exe → "resources with extension apk are not
        // allowed") based on this name and rejects the whole upload. Raw
        // installers are therefore stored extension-less; the public
        // download filename is set by our /api/downloads/[platform] proxy.
        ...(opts.resourceType === "raw"
          ? {}
          : { filename_override: file.name }),
        // Don't apply any image transformations — keep the raw file.
        transformation: [],
      },
      (err, result) => {
        if (err) {
          console.error("[saveUploadedFile] Cloudinary upload error:", err)
          reject(new Error(`Upload failed: ${err.message}`))
          return
        }
        if (!result?.secure_url) {
          reject(new Error("Upload failed: no URL returned from Cloudinary."))
          return
        }
        resolve({
          url: result.secure_url,
          fileName: file.name,
        })
      }
    )
    uploadStream.end(buffer)
  })
}
