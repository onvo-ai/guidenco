import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { db } from './db/client'
import { devices } from './db/schema'
import { eq } from 'drizzle-orm'

// Active Pi connections: deviceId → WebSocket
const connections = new Map<string, WebSocket>()

// Latest frame per device: deviceId → base64 JPEG string
const latestFrames = new Map<string, string>()

// Browser SSE listeners: deviceId → Set of callbacks
const listeners = new Map<string, Set<(data: string) => void>>()

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

    // Buffer the latest frame so the agent loop can read it
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'frame' && typeof msg.data === 'string') {
        latestFrames.set(device.id, msg.data)
      }
    } catch { /* non-JSON message */ }

    // Forward to any browser SSE listeners (video stream, events)
    const deviceListeners = listeners.get(device.id)
    deviceListeners?.forEach((cb) => cb(raw))
  })

  ws.on('close', () => {
    connections.delete(device.id)
    latestFrames.delete(device.id)
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

export function isDeviceOnline(deviceId: string): boolean {
  const ws = connections.get(deviceId)
  return ws !== undefined && ws.readyState === 1
}
