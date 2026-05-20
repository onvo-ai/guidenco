import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // status is updated in real-time by the WebSocket relay handler in server.ts
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id))

  return Response.json(rows)
}
