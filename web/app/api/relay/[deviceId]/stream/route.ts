import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { addBrowserListener } from '@/lib/relay'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { deviceId } = await params

  // Verify device belongs to this user
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // client disconnected
        }
      }

      const remove = addBrowserListener(deviceId, (raw) => send(raw))

      req.signal.addEventListener('abort', () => {
        remove()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
