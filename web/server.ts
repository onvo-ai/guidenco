import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade, sendToDevice, addBrowserListener } from './lib/relay'
import { ensureBucket } from './lib/minio'
import { auth } from './lib/auth'
import { db } from './lib/db/client'
import { devices } from './lib/db/schema'
import { and, eq } from 'drizzle-orm'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

// Disable Turbopack — it crashes on dynamic route segments with native Node packages.
// Use webpack (the stable bundler) instead.
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

// POST /api/relay/:deviceId/command — handled in server.ts so it shares the
// same relay.ts module instance as the WebSocket upgrade handler.
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

  const body = await readBody(req) as Record<string, string> | null
  const { goal, instructions } = body ?? {}

  if (!goal) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'goal required' }))
    return
  }

  const sent = sendToDevice(
    deviceId,
    JSON.stringify({ type: 'command', goal, instructions: instructions ?? '' })
  )

  if (!sent) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Device offline' }))
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

// GET /api/relay/:deviceId/stream — SSE endpoint, also handled in server.ts
// so addBrowserListener works against the same Map as the WS handler.
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
    'Access-Control-Allow-Origin': '*',
  })
  res.flushHeaders()

  const remove = addBrowserListener(deviceId, (raw) => {
    try {
      res.write(raw)
    } catch {
      // client disconnected
    }
  })

  req.on('close', () => {
    remove()
  })
}

app.prepare().then(async () => {
  await ensureBucket()

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true)
    const pathname = parsedUrl.pathname ?? ''

    // Relay command — must run in this process to access in-memory WebSocket map
    const cmdMatch = pathname.match(/^\/api\/relay\/([^/]+)\/command$/)
    if (cmdMatch && req.method === 'POST') {
      await handleCommand(req, res, cmdMatch[1])
      return
    }

    // Relay SSE stream — same reason
    const streamMatch = pathname.match(/^\/api\/relay\/([^/]+)\/stream$/)
    if (streamMatch && req.method === 'GET') {
      await handleStream(req, res, streamMatch[1])
      return
    }

    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '/', true)
    if (pathname === '/relay/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleRelayUpgrade(ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })
})
