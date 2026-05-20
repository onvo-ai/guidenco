import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { isDeviceOnline } from '@/lib/relay'

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(eq(devices.userId, session.user.id))

  // Reflect live relay status
  const result = rows.map((d) => ({
    ...d,
    status: isDeviceOnline(d.id) ? 'online' : 'offline',
  }))

  return Response.json(result)
}
