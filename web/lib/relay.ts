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

// Throttle thumbnail persistence: deviceId → last save timestamp (ms)
const lastThumbnailSave = new Map<string, number>()
const THUMBNAIL_SAVE_INTERVAL_MS = 30_000

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()

// Pending WebRTC answer callbacks: deviceId → { resolve, reject }
const webrtcPending = new Map<string, { resolve: (sdp: string) => void; reject: (err: Error) => void }>()

// ── Agent stop flags ──────────────────────────────────────────────────────────
// Set by the stop endpoint; cleared when a new agent loop starts.
const stopFlags = new Map<string, boolean>()

export function requestAgentStop(deviceId: string) { stopFlags.set(deviceId, true) }
export function clearAgentStop(deviceId: string)   { stopFlags.delete(deviceId) }
export function isAgentStopRequested(deviceId: string) { return stopFlags.get(deviceId) === true }

const WEBRTC_ANSWER_TIMEOUT_MS = 15_000

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

      // WebRTC answer — resolve pending offer promise; do NOT forward to SSE
      if (msg.type === 'webrtc:answer' && typeof msg.sdp === 'string') {
        _resolveWebRTCAnswer(device.id, msg.sdp as string)
        return
      }
    }

    // Forward everything else to browser SSE listeners
    const deviceListeners = listeners.get(device.id)
    deviceListeners?.forEach((cb) => cb(raw))
  })

  ws.on('close', () => {
    // Only clean up if THIS ws is still the active one for the device. If the
    // Pi reconnected and a newer ws replaced it, leave the new connection alone.
    if (connections.get(device.id) !== ws) return

    connections.delete(device.id)
    latestFrames.delete(device.id)
    listeners.delete(device.id)
    const pending = webrtcPending.get(device.id)
    if (pending) {
      webrtcPending.delete(device.id)
      pending.reject(new Error(`Device ${device.id} disconnected while WebRTC offer was in-flight`))
    }
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

export function isDeviceOnline(deviceId: string): boolean {
  const ws = connections.get(deviceId)
  return ws !== undefined && ws.readyState === 1
}

/**
 * Wait for the Pi to send a webrtc:answer for the given device.
 * Resolves with the answer SDP, or rejects after 15 seconds.
 */
export function waitForWebRTCAnswer(deviceId: string): Promise<string> {
  if (webrtcPending.has(deviceId)) {
    return Promise.reject(new Error(`WebRTC offer already in-flight for ${deviceId}`))
  }
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      webrtcPending.delete(deviceId)
      reject(new Error(`WebRTC answer timeout for device ${deviceId}`))
    }, WEBRTC_ANSWER_TIMEOUT_MS)

    webrtcPending.set(deviceId, {
      resolve: (sdp: string) => { clearTimeout(timer); resolve(sdp) },
      reject:  (err: Error) => { clearTimeout(timer); reject(err) },
    })
  })
}

/** Returns true if there is already a pending WebRTC offer for this device. */
export function isWebRTCPending(deviceId: string): boolean {
  return webrtcPending.has(deviceId)
}

/** Cancel a pending WebRTC offer promise with an error. */
export function cancelWebRTCPending(deviceId: string, err: Error): void {
  const pending = webrtcPending.get(deviceId)
  if (pending) {
    webrtcPending.delete(deviceId)
    pending.reject(err)
  }
}

/** Called internally (and exported for tests) when a webrtc:answer arrives. */
export function _resolveWebRTCAnswer(deviceId: string, sdp: string): void {
  const pending = webrtcPending.get(deviceId)
  if (pending) {
    webrtcPending.delete(deviceId)
    pending.resolve(sdp)
  }
}
