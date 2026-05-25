import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { devices } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const { name } = body ?? {}

  if (!name || typeof name !== 'string') {
    return Response.json({ error: 'name required' }, { status: 400 })
  }

  const [updated] = await db
    .update(devices)
    .set({ name })
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id, name: devices.name })

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Look up the device first so we can kill the e2b sandbox (if any) before
  // the row disappears.
  const [device] = await db
    .select({
      id:         devices.id,
      deviceType: devices.deviceType,
      metadata:   devices.metadata,
    })
    .from(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .limit(1)

  if (!device) return Response.json({ error: 'Not found' }, { status: 404 })

  if (device.deviceType === 'remote') {
    const sandboxId = (device.metadata as { sandboxId?: string } | null)?.sandboxId
    if (sandboxId) {
      const { terminateSandbox } = await import('@/lib/sandbox')
      await terminateSandbox(sandboxId)  // idempotent; swallows errors
    }
  }

  const [deleted] = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}
