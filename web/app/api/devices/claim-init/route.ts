import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims } from '@/lib/db/schema'
import { generateCode } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const deviceId = body?.device_id

  if (!deviceId || typeof deviceId !== 'string') {
    return Response.json({ error: 'device_id required' }, { status: 400 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

  await db.insert(deviceClaims).values({ deviceId, code, expiresAt })

  return Response.json({ code })
}
