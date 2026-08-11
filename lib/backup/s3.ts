/**
 * Off-host backup upload to S3-compatible storage (Roadmap item 11).
 *
 * Pushes the local backup file to an S3 bucket (or any S3-compatible
 * endpoint: R2, MinIO, Backblaze B2, Wasabi). The caller passes the local
 * file path and a key (e.g. `backups/2026-08-11/backup-XYZ.json.gz`); on
 * success, returns the `s3://bucket/key` URI for the caller to persist on
 * the Backup row.
 *
 * Graceful fallback: when the S3 env vars are unset (local dev, CI, fresh
 * deploy), the function returns `null` so the caller can keep the local-only
 * storage path. No exception, no log spam — silent degradation.
 *
 * Env vars:
 *   S3_BACKUP_BUCKET          — target bucket name (required)
 *   S3_BACKUP_ACCESS_KEY_ID   — IAM access key (required)
 *   S3_BACKUP_SECRET_ACCESS_KEY — IAM secret (required)
 *   S3_BACKUP_REGION          — AWS region (default: us-east-1)
 *   S3_BACKUP_ENDPOINT        — override for R2/MinIO/B2 (optional)
 *   S3_BACKUP_FORCE_PATH_STYLE — true for MinIO (optional)
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { promises as fs } from "node:fs"

/** True iff the S3 env vars are configured. */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BACKUP_BUCKET &&
      process.env.S3_BACKUP_ACCESS_KEY_ID &&
      process.env.S3_BACKUP_SECRET_ACCESS_KEY,
  )
}

/**
 * Upload the local file at `localPath` to S3 under `key`. Returns the
 * `s3://bucket/key` URI on success, or null when S3 isn't configured
 * (degrades to local-only storage silently).
 *
 * Throws on upload failure (network, auth, bucket missing) — the caller
 * decides whether to swallow (keep local-only) or surface the error.
 */
export async function uploadBackupToS3(
  localPath: string,
  key: string,
): Promise<string | null> {
  if (!isS3Configured()) {
    return null
  }

  const s3 = new S3Client({
    region: process.env.S3_BACKUP_REGION || "us-east-1",
    // Allow overriding the endpoint for R2/MinIO/B2/Wasabi. The SDK detects
    // the custom endpoint from this env var.
    ...(process.env.S3_BACKUP_ENDPOINT
      ? { endpoint: process.env.S3_BACKUP_ENDPOINT }
      : {}),
    // MinIO requires path-style addressing (bucket-as-subdomain won't work
    // without DNS setup). When the operator sets FORCE_PATH_STYLE=true, we
    // switch the SDK to path-style.
    ...(process.env.S3_BACKUP_FORCE_PATH_STYLE === "true"
      ? { forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: process.env.S3_BACKUP_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_BACKUP_SECRET_ACCESS_KEY!,
    },
  })

  const body = await fs.readFile(localPath)

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BACKUP_BUCKET!,
      Key: key,
      Body: body,
      // application/gzip matches the spec, but the backup module currently
      // writes plain JSON. We set the type based on the file extension so
      // both .json and .json.gz work.
      ContentType: localPath.endsWith(".gz")
        ? "application/gzip"
        : "application/json",
      // Server-side encryption at rest — always on. S3-KMS would be better
      // but requires a KMS key ARN; SSE-AES256 is the zero-config default.
      ServerSideEncryption: "AES256",
    }),
  )

  return `s3://${process.env.S3_BACKUP_BUCKET}/${key}`
}
