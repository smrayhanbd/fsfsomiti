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
export async function saveUploadedFile(file: File, subdir: string): Promise<SavedFile> {
  if (file.size > MAX_BYTES) {
    throw new Error("File is too large. Maximum size is 10 MB.")
  }

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
        resource_type: "auto",
        folder: "future-savings",
        public_id: publicId,
        // Overwrite the filename in Cloudinary's metadata so the original
        // name is preserved for download links (we also return it below).
        filename_override: file.name,
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
