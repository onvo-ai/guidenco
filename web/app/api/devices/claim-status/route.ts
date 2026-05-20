import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims, devices } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('device_id')

  if (!deviceId) {
    return Response.json({ error: 'device_id required' }, { status: 400 })
  }

  // Find the most recent claim for this device_id
  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(eq(deviceClaims.deviceId, deviceId))
    .orderBy(desc(deviceClaims.expiresAt))
    .limit(1)

  if (!claim) {
    return Response.json({ status: 'not_found' }, { status: 404 })
  }

  if (new Date() > claim.expiresAt && !claim.claimedAt) {
    return Response.json({ status: 'expired' })
  }

  if (!claim.claimedAt) {
    return Response.json({ status: 'pending' })
  }

  // Claimed — find the device token
  const [device] = await db
    .select({ deviceToken: devices.deviceToken })
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1)

  if (!device) {
    return Response.json({ status: 'pending' })
  }

  return Response.json({ status: 'claimed', device_token: device.deviceToken })
}
