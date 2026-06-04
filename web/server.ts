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

  startAgentLoop(deviceId, goal, instructions ?? '').catch((err) => {
    console.error(`[agent] loop crashed for ${deviceId}:`, err)
    emitToListeners(deviceId, JSON.stringify({ type: 'agent:error', message: String(err) }))
  })

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

// POST /api/relay/:deviceId/input
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

  const remove = addBrowserListener(deviceId, (raw) => {
    try {
      res.write(`data: ${raw}\n\n`)
    } catch { /* client disconnected */ }
  })

  req.on('close', remove)
}

// GET /api/relay/:deviceId/thumbnail
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

app.prepare().then(async () => {
  await ensureBucket()
  startSandboxJanitor()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true)
    const pathname = parsedUrl.pathname ?? ''

    const cmdMatch = pathname.match(/^\/api\/relay\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      await handleCommand(req, res, cmdMatch[1])
      return
    }

    const streamMatch = pathname.match(/^\/api\/relay\/([^/]+)\/stream$/)
    if (streamMatch && req.method === 'GET') {
      await handleStream(req, res, streamMatch[1])
      return
    }

    const inputMatch = pathname.match(/^\/api\/relay\/([^/]+)\/input$/)
    if (inputMatch && req.method === 'POST') {
      await handleInput(req, res, inputMatch[1])
      return
    }

    const stopMatch = pathname.match(/^\/api\/relay\/([^/]+)\/stop$/)
    if (stopMatch && req.method === 'POST') {
      await handleStop(req, res, stopMatch[1])
      return
    }

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
      nextUpgrade(req, socket, head)
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
