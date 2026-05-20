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

export async function presignedUrl(key: string, expirySeconds = 3600): Promise<string> {
  return minio.presignedGetObject(BUCKET, key, expirySeconds)
}

export { BUCKET }
