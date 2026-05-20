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

  const [deleted] = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.userId, session.user.id)))
    .returning({ id: devices.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ ok: true })
}
