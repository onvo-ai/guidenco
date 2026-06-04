import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { db } from './db/client'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'
import { saveThumbnail } from './minio'

// Active Pi connections: deviceId → WebSocket
const connections = new Map<string, WebSocket>()

// Latest frame per device: deviceId → base64 JPEG string
const latestFrames = new Map<string, string>()
// Timestamp (Date.now()) when each frame was stored
const latestFrameTs = new Map<string, number>()

// Throttle thumbnail persistence: deviceId → last save timestamp (ms)
const lastThumbnailSave = new Map<string, number>()
const THUMBNAIL_SAVE_INTERVAL_MS = 30_000

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()

// ── Agent stop flags ──────────────────────────────────────────────────────────
const stopFlags = new Map<string, boolean>()

export function requestAgentStop(deviceId: string) { stopFlags.set(deviceId, true) }
export function clearAgentStop(deviceId: string)   { stopFlags.delete(deviceId) }
export function isAgentStopRequested(deviceId: string) { return stopFlags.get(deviceId) === true }

export async function handleRelayUpgrade(ws: WebSocket, req: IncomingMessage) {
  const rawUrl = req.url ?? '/'
  const url = new URL(rawUrl, 'http://localhost')
  const token = url.searchParams.get('device_token')

  if (!token) {
    ws.close(4001, 'Missing device_token')
    return
  }

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.deviceToken, token))
    .limit(1)

  if (!device) {
    ws.close(4001, 'Invalid device_token')
    return
  }

  await db
    .update(devices)
    .set({ status: 'online', lastSeenAt: new Date() })
    .where(eq(devices.id, device.id))

  connections.set(device.id, ws)

  ws.on('message', (data) => {
    const raw = data.toString()

    let msg: Record<string, unknown> | null = null
    try { msg = JSON.parse(raw) } catch { /* non-JSON */ }

    if (msg) {
      // Buffer latest frame for agent loop
      if (msg.type === 'frame' && typeof msg.data === 'string') {
        latestFrames.set(device.id, msg.data as string)
        latestFrameTs.set(device.id, Date.now())

        // Throttle thumbnail persistence to MinIO (~once per 30s per device)
        const now = Date.now()
        const last = lastThumbnailSave.get(device.id) ?? 0
        if (now - last >= THUMBNAIL_SAVE_INTERVAL_MS) {
          lastThumbnailSave.set(device.id, now)
          const jpeg = Buffer.from(msg.data as string, 'base64')
          saveThumbnail(device.id, jpeg).catch((err) =>
            console.error(`[relay] saveThumbnail failed (${device.id}):`, err.message)
          )
        }
      }
    }

    // Forward everything to browser SSE listeners
    const deviceListeners = listeners.get(device.id)
    deviceListeners?.forEach((cb) => cb(raw))
  })

  ws.on('close', () => {
    if (connections.get(device.id) !== ws) return

    connections.delete(device.id)
    latestFrames.delete(device.id)
    latestFrameTs.delete(device.id)
    listeners.delete(device.id)
    db
      .update(devices)
      .set({ status: 'offline' })
      .where(eq(devices.id, device.id))
      .catch((err) => console.error(`[relay] failed to mark device offline (${device.id}):`, err))
  })

  ws.on('error', (err) => {
    console.error(`[relay] Pi WS error (${device.id}):`, err.message)
  })
}

export function sendToDevice(deviceId: string, message: string): boolean {
  const ws = connections.get(deviceId)
  if (!ws || ws.readyState !== 1 /* OPEN */) return false
  ws.send(message, (err) => {
    if (err) console.error(`[relay] send failed (${deviceId}):`, err.message)
  })
  return true
}

export function addBrowserListener(
  deviceId: string,
  cb: (data: string) => void
): () => void {
  if (!listeners.has(deviceId)) listeners.set(deviceId, new Set())
  listeners.get(deviceId)!.add(cb)
  return () => listeners.get(deviceId)?.delete(cb)
}

/** Emit a JSON-serialisable event to all browser SSE listeners for this device. */
export function emitToListeners(deviceId: string, data: string) {
  const deviceListeners = listeners.get(deviceId)
  deviceListeners?.forEach((cb) => cb(data))
}

/** Latest JPEG frame (base64) received from the Pi, or null if none yet. */
export function getLatestFrame(deviceId: string): string | null {
  return latestFrames.get(deviceId) ?? null
}

/**
 * Wait until a frame arrives whose timestamp is strictly after `afterTs`.
 * Guarantees the agent sees a frame captured after the last action was dispatched.
 * Returns the frame data, or null on timeout.
 */
export async function waitForFreshFrame(
  deviceId: string,
  afterTs: number,
  timeoutMs = 10_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ts    = latestFrameTs.get(deviceId) ?? 0
    const frame = latestFrames.get(deviceId)  ?? null
    if (frame && ts > afterTs) return frame
    await new Promise<void>(r => setTimeout(r, 80))
  }
  return null
}

export function isDeviceOnline(deviceId: string): boolean {
  const ws = connections.get(deviceId)
  return ws !== undefined && ws.readyState === 1
}
