import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade, addBrowserListener, isDeviceOnline, emitToListeners, sendToDevice, requestAgentStop, getLatestFrame } from './lib/relay'
import { startAgentLoop } from './lib/agent'
import { ensureBucket, fetchThumbnail } from './lib/minio'
import { startSandboxJanitor } from './lib/sandbox-janitor'
import { auth } from './lib/auth'
import { db } from './lib/db/client'
import { devices } from './lib/db/schema'
import { and, eq } from 'drizzle-orm'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

// Disable Turbopack — it crashes on dynamic route segments with native Node packages.
const app = next({ dev, turbopack: false })
const handle = app.getRequestHandler()

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Parse a JSON request body, resolving null on malformed/empty input. */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) } catch { resolve(null) }
    })
    req.on('error', reject)
  })
}

/** Resolve a Better Auth session from raw Node.js request headers. */
async function getSession(req: IncomingMessage) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  return auth.api.getSession({ headers })
}

type DeviceHandler = (req: IncomingMessage, res: ServerResponse, deviceId: string) => Promise<void> | void

/**
 * Guard a device-scoped route: require a session and verify the caller owns the
 * device, then invoke the handler. Replies 401/404 itself on failure.
 */
async function withDeviceAuth(
  req: IncomingMessage,
  res: ServerResponse,
  deviceId: string,
  handler: DeviceHandler,
) {
  const session = await getSession(req)
  if (!session) return sendJson(res, 401, { error: 'Unauthorized' })

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)
  if (!device) return sendJson(res, 404, { error: 'Not found' })

  await handler(req, res, deviceId)
}

// ── Route handlers (auth + ownership already verified) ─────────────────────────

// POST /api/relay/:deviceId/command
async function handleCommand(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  if (!isDeviceOnline(deviceId)) return sendJson(res, 503, { error: 'Device offline' })

  const body = await readBody(req) as Record<string, string> | null
  const { goal, instructions } = body ?? {}
  if (!goal) return sendJson(res, 400, { error: 'goal required' })

  startAgentLoop(deviceId, goal, instructions ?? '').catch((err) => {
    console.error(`[agent] loop crashed for ${deviceId}:`, err)
    emitToListeners(deviceId, JSON.stringify({ type: 'agent:error', message: String(err) }))
  })
  sendJson(res, 200, { ok: true })
}

// POST /api/relay/:deviceId/input
async function handleInput(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const body = await readBody(req) as Record<string, unknown> | null
  if (!body) return sendJson(res, 400, { error: 'Invalid body' })

  const sent = sendToDevice(deviceId, JSON.stringify({ type: 'action', action: body }))
  sendJson(res, sent ? 200 : 503, { ok: sent })
}

// GET /api/relay/:deviceId/stream — SSE proxy of Pi frames + agent events.
function handleStream(req: IncomingMessage, res: ServerResponse, deviceId: string) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  })
  res.flushHeaders()

  const remove = addBrowserListener(deviceId, (raw) => {
    try { res.write(`data: ${raw}\n\n`) } catch { /* client disconnected */ }
  })
  req.on('close', remove)
}

// GET /api/relay/:deviceId/thumbnail — live frame if connected, else stored.
async function handleThumbnail(_req: IncomingMessage, res: ServerResponse, deviceId: string) {
  const live = getLatestFrame(deviceId)
  const jpeg = live ? Buffer.from(live, 'base64') : await fetchThumbnail(deviceId)
  if (!jpeg) return sendJson(res, 404, { error: 'No thumbnail available' })

  res.writeHead(200, {
    'Content-Type':   'image/jpeg',
    'Content-Length': jpeg.length,
    'Cache-Control':  'no-store',
  })
  res.end(jpeg)
}

// POST /api/relay/:deviceId/stop
function handleStop(_req: IncomingMessage, res: ServerResponse, deviceId: string) {
  requestAgentStop(deviceId)
  sendJson(res, 200, { ok: true })
}

// ── Routing table ──────────────────────────────────────────────────────────────

const ROUTES: { method: string; pattern: RegExp; handler: DeviceHandler }[] = [
  { method: 'POST', pattern: /^\/api\/relay\/([^/]+)\/command$/,   handler: handleCommand },
  { method: 'GET',  pattern: /^\/api\/relay\/([^/]+)\/stream$/,    handler: handleStream },
  { method: 'POST', pattern: /^\/api\/relay\/([^/]+)\/input$/,     handler: handleInput },
  { method: 'POST', pattern: /^\/api\/relay\/([^/]+)\/stop$/,      handler: handleStop },
  { method: 'GET',  pattern: /^\/api\/relay\/([^/]+)\/thumbnail$/, handler: handleThumbnail },
]

app.prepare().then(async () => {
  await ensureBucket()
  startSandboxJanitor()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true)
    const pathname = parsedUrl.pathname ?? ''

    for (const { method, pattern, handler } of ROUTES) {
      const match = pathname.match(pattern)
      if (match && req.method === method) {
        await withDeviceAuth(req, res, match[1], handler)
        return
      }
    }

    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })
  const nextUpgrade = app.getUpgradeHandler()

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/', true)
    if (pathname === '/relay/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => handleRelayUpgrade(ws, req))
    } else {
      nextUpgrade(req, socket, head)
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
