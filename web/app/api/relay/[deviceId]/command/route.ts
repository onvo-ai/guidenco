import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendToDevice } from '@/lib/relay'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function POST(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { deviceId } = await params

  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const { goal, instructions } = body ?? {}

  if (!goal) return Response.json({ error: 'goal required' }, { status: 400 })

  const sent = sendToDevice(
    deviceId,
    JSON.stringify({ type: 'command', goal, instructions: instructions ?? '' })
  )

  if (!sent) {
    return Response.json({ error: 'Device offline' }, { status: 503 })
  }

  return Response.json({ ok: true })
}
