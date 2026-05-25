import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade, addBrowserListener, isDeviceOnline, emitToListeners, waitForWebRTCAnswer, sendToDevice, isWebRTCPending, cancelWebRTCPending, requestAgentStop, getLatestFrame } from './lib/relay'
import { startAgentLoop } from './lib/agent'
import { ensureBucket, fetchThumbnail } from './lib/minio'
import { startSandboxJanitor } from './lib/sandbox-janitor'
import { auth } from './lib/auth'
import { db } from './lib/db/client'
import { devices } from './lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { generateTurnCredentials } from './lib/cloudflare-turn'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

// Disable Turbopack — it crashes on dynamic route segments with native Node packages.
const app = next({ dev, turbopack: false })
const handle = app.getRequestHandler()

// Parse JSON body from an IncomingMessage
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(null)
      }
    })
    req.on('error', reject)
  })
}

// Get a Better Auth session from raw Node.js headers
async function getSession(req: IncomingMessage) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return auth.api.getSession({ headers })
}

// POST /api/relay/:deviceId/command
// Starts the web-side agent loop (VLM + action dispatch).
// Handled here — not in a Next.js route — so it shares the relay.ts module instance.
async function handleCommand(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  if (!isDeviceOnline(deviceId)) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Device offline' }))
    return
  }

  const body = await readBody(req) as Record<string, string> | null
  const { goal, instructions } = body ?? {}

  if (!goal) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'goal required' }))
    return
  }

  // Start agent loop asynchronously — respond immediately
  startAgentLoop(deviceId, goal, instructions ?? '').catch((err) => {
    console.error(`[agent] loop crashed for ${deviceId}:`, err)
    emitToListeners(deviceId, JSON.stringify({ type: 'agent:error', message: String(err) }))
  })

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

// POST /api/relay/:deviceId/input
// Forwards a manual mouse/keyboard action directly to the Pi.
async function handleInput(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const body = await readBody(req) as Record<string, unknown> | null
  if (!body) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid body' }))
    return
  }

  const sent = sendToDevice(deviceId, JSON.stringify({ type: 'action', action: body }))
  res.writeHead(sent ? 200 : 503, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: sent }))
}

// GET /api/relay/:deviceId/stream — SSE, proxied from the Pi and agent events.
// Handled here so addBrowserListener works against the same Map as the WS handler.
async function handleStream(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()

  // Write each message as a proper SSE event
  const remove = addBrowserListener(deviceId, (raw) => {
    try {
      res.write(`data: ${raw}\n\n`)
    } catch { /* client disconnected */ }
  })

  req.on('close', remove)
}

// GET /api/relay/:deviceId/ice-servers
// Returns ephemeral ICE server config (STUN + TURN) for the browser to use
// when creating its RTCPeerConnection.
async function handleIceServers(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const iceServers = await generateTurnCredentials()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ iceServers }))
}

// POST /api/relay/:deviceId/webrtc-offer
// Receives browser SDP offer, forwards to Pi (with TURN credentials), returns Pi's SDP answer.
// GET /api/relay/:deviceId/thumbnail — latest device screen as JPEG
// Memory-first (live frame), then MinIO (persisted ~every 30s).
async function handleThumbnail(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  // Prefer the in-memory live frame if available
  const live = getLatestFrame(deviceId)
  if (live) {
    const buf = Buffer.from(live, 'base64')
    res.writeHead(200, {
      'Content-Type':  'image/jpeg',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    })
    res.end(buf)
    return
  }

  // Fall back to the persisted MinIO thumbnail
  const stored = await fetchThumbnail(deviceId)
  if (stored) {
    res.writeHead(200, {
      'Content-Type':  'image/jpeg',
      'Content-Length': stored.length,
      'Cache-Control': 'no-store',
    })
    res.end(stored)
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'No thumbnail available' }))
}

async function handleStop(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  requestAgentStop(deviceId)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

async function handleWebRTCOffer(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const session = await getSession(req)
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  if (!isDeviceOnline(deviceId)) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Device offline' }))
    return
  }

  if (isWebRTCPending(deviceId)) {
    res.writeHead(409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'WebRTC offer already in-flight for this device' }))
    return
  }

  const body = await readBody(req) as { sdp?: string; type?: string } | null
  if (!body?.sdp) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'sdp required' }))
    return
  }

  // Register answer listener BEFORE sending offer to avoid race condition
  const answerPromise = waitForWebRTCAnswer(deviceId)

  // Generate fresh TURN credentials for the Pi so it can traverse NAT too
  const piIceServers = await generateTurnCredentials()

  const sent = sendToDevice(deviceId, JSON.stringify({ type: 'webrtc:offer', sdp: body.sdp, iceServers: piIceServers }))
  if (!sent) {
    cancelWebRTCPending(deviceId, new Error('Device not reachable'))
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Failed to reach device' }))
    return
  }

  try {
    const answerSdp = await answerPromise
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ type: 'answer', sdp: answerSdp }))
  } catch {
    res.writeHead(504, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Timeout waiting for WebRTC answer from device' }))
  }
}

app.prepare().then(async () => {
  await ensureBucket()
  startSandboxJanitor()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true)
    const pathname = parsedUrl.pathname ?? ''

    // Relay command — starts the agent loop on this process
    const cmdMatch = pathname.match(/^\/api\/relay\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      await handleCommand(req, res, cmdMatch[1])
      return
    }

    // Relay SSE stream — forwards Pi frames + agent events to browser
    const streamMatch = pathname.match(/^\/api\/relay\/([^/]+)\/stream$/)
    if (streamMatch && req.method === 'GET') {
      await handleStream(req, res, streamMatch[1])
      return
    }

    // Manual input relay — forwards mouse/keyboard actions to the Pi
    const inputMatch = pathname.match(/^\/api\/relay\/([^/]+)\/input$/)
    if (inputMatch && req.method === 'POST') {
      await handleInput(req, res, inputMatch[1])
      return
    }

    // ICE servers — returns ephemeral TURN credentials for the browser
    const iceServersMatch = pathname.match(/^\/api\/relay\/([^/]+)\/ice-servers$/)
    if (iceServersMatch && req.method === 'GET') {
      await handleIceServers(req, res, iceServersMatch[1])
      return
    }

    // WebRTC offer — browser sends SDP offer, server relays to Pi, returns answer
    const webrtcOfferMatch = pathname.match(/^\/api\/relay\/([^/]+)\/webrtc-offer$/)
    if (webrtcOfferMatch && req.method === 'POST') {
      await handleWebRTCOffer(req, res, webrtcOfferMatch[1])
      return
    }

    // Stop agent — sets a flag the running loop checks on each iteration
    const stopMatch = pathname.match(/^\/api\/relay\/([^/]+)\/stop$/)
    if (stopMatch && req.method === 'POST') {
      await handleStop(req, res, stopMatch[1])
      return
    }

    // Thumbnail — latest device screen JPEG
    const thumbMatch = pathname.match(/^\/api\/relay\/([^/]+)\/thumbnail$/)
    if (thumbMatch && req.method === 'GET') {
      await handleThumbnail(req, res, thumbMatch[1])
      return
    }

    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

  const nextUpgrade = app.getUpgradeHandler()

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/', true)
    if (pathname === '/relay/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleRelayUpgrade(ws, req)
      })
    } else {
      // Forward all other WebSocket connections (Next.js HMR, etc.) to Next.js
      nextUpgrade(req, socket, head)
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
