import { v2 as cloudinary } from "cloudinary"

// Configure Cloudinary with the keys from your .env file
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadImage(file: File): Promise<string | null> {
  if (!file) return null

  // Convert file to buffer
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { resource_type: "auto", folder: "future-savings-members" },
      (err, result) => {
        if (err) {
          console.error("Cloudinary upload error:", err)
          reject(err)
        }
        resolve(result?.secure_url || null)
      }
    ).end(buffer)
  })
}