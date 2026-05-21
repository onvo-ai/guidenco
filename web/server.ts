import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade, addBrowserListener, isDeviceOnline, emitToListeners } from './lib/relay'
import { startAgentLoop } from './lib/agent'
import { ensureBucket } from './lib/minio'
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

app.prepare().then(async () => {
  await ensureBucket()

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

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
