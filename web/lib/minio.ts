import { Client } from 'minio'

const BUCKET = process.env.MINIO_BUCKET ?? 'guidenco'

export const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
})

export async function ensureBucket(): Promise<void> {
  const exists = await minio.bucketExists(BUCKET)
  if (!exists) {
    await minio.makeBucket(BUCKET)
  }
}

export function screenshotKey(deviceId: string, jobId: string | null, ts: Date): string {
  const prefix = jobId ? `${deviceId}/${jobId}` : `${deviceId}/manual`
  return `${prefix}/${ts.getTime()}.jpg`
}

export function thumbnailKey(deviceId: string): string {
  return `thumbnails/${deviceId}.jpg`
}

export async function presignedUrl(key: string, expirySeconds = 3600): Promise<string> {
  return minio.presignedGetObject(BUCKET, key, expirySeconds)
}

/** Save a JPEG buffer as the latest thumbnail for a device. */
export async function saveThumbnail(deviceId: string, jpeg: Buffer): Promise<void> {
  await minio.putObject(BUCKET, thumbnailKey(deviceId), jpeg, jpeg.length, {
    'Content-Type': 'image/jpeg',
  })
}

/** Fetch the persisted thumbnail JPEG, or null if none exists. */
export async function fetchThumbnail(deviceId: string): Promise<Buffer | null> {
  try {
    const stream = await minio.getObject(BUCKET, thumbnailKey(deviceId))
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

export { BUCKET }
