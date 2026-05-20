import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { deviceClaims, devices } from '@/lib/db/schema'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { generateDeviceToken } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { code, name } = body ?? {}

  if (!code || !name) {
    return Response.json({ error: 'code and name required' }, { status: 400 })
  }

  // Find a valid, unclaimed claim with this code
  const [claim] = await db
    .select()
    .from(deviceClaims)
    .where(
      and(
        eq(deviceClaims.code, code.toUpperCase()),
        isNull(deviceClaims.claimedAt),
        gt(deviceClaims.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!claim) {
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 })
  }

  const deviceToken = generateDeviceToken()

  // Create the device record — use the claim's deviceId as the devices.id
  // so claim-status can look it up directly
  await db.insert(devices).values({
    id: claim.deviceId,
    userId: session.user.id,
    name,
    deviceToken,
    status: 'offline',
  })

  // Mark claim as redeemed
  await db
    .update(deviceClaims)
    .set({ claimedAt: new Date() })
    .where(eq(deviceClaims.id, claim.id))

  return Response.json({ ok: true })
}
