import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'
import { generateDeviceToken } from '@/lib/utils'
import { createSandbox } from '@/lib/sandbox'

// Resolve the public origin of this server for the sandbox to call back to.
function originFromRequest(req: NextRequest): string {
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const forwardedHost  = req.headers.get('x-forwarded-host')
  const host = forwardedHost ?? req.headers.get('host') ?? 'localhost'
  const proto = forwardedProto ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { name?: string } | null
  const name = body?.name?.trim()
  if (!name) {
    return Response.json({ error: 'name required' }, { status: 400 })
  }

  // 1. Create the device row up front so we can pass deviceId + token to the sandbox.
  const deviceToken = generateDeviceToken()
  const [device] = await db
    .insert(devices)
    .values({
      userId:      session.user.id,
      name,
      deviceToken,
      status:      'offline',
      deviceType:  'remote',
      os:          'linux',
      metadata:    null,
    })
    .returning({ id: devices.id })

  // 2. Provision the sandbox. If this fails, delete the orphan row.
  let sandboxId: string
  try {
    sandboxId = await createSandbox(device.id, deviceToken, originFromRequest(req))
  } catch (err) {
    await db.delete(devices).where(eq(devices.id, device.id))
    const msg = err instanceof Error ? err.message : 'sandbox provisioning failed'
    return Response.json({ error: msg }, { status: 500 })
  }

  // 3. Stash the sandbox id so the DELETE handler and janitor can terminate it.
  await db
    .update(devices)
    .set({ metadata: { sandboxId } })
    .where(eq(devices.id, device.id))

  return Response.json({ id: device.id, name, sandboxId })
}
