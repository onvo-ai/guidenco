import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleRelayUpgrade } from './lib/relay'
import { ensureBucket } from './lib/minio'

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT ?? '3000', 10)

// Disable Turbopack — it crashes on dynamic route segments with native Node packages.
// Use webpack (the stable bundler) instead.
const app = next({ dev, turbopack: false })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  await ensureBucket()

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
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
