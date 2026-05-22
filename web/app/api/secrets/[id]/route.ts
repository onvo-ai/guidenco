import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { secrets } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

const KEY_RE = /^[A-Z][A-Z0-9_]*$/

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as
    | { key?: string; value?: string; description?: string }
    | null
  if (!body) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const key = String(body.key ?? '').trim()
  const value = String(body.value ?? '')
  const description = String(body.description ?? '').trim()

  if (!KEY_RE.test(key)) {
    return Response.json(
      { error: 'Key must be UPPER_SNAKE_CASE (A-Z, 0-9, _), starting with a letter.' },
      { status: 400 }
    )
  }
  if (!value) {
    return Response.json({ error: 'Value required' }, { status: 400 })
  }

  // Make sure it belongs to the user, and the key isn't used by a different row
  const [own] = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.id, id), eq(secrets.userId, session.user.id)))
    .limit(1)
  if (!own) return Response.json({ error: 'Not found' }, { status: 404 })

  const [collision] = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.userId, session.user.id), eq(secrets.key, key)))
    .limit(1)
  if (collision && collision.id !== id) {
    return Response.json({ error: `Another secret already uses key "${key}".` }, { status: 409 })
  }

  const [row] = await db
    .update(secrets)
    .set({ key, value, description, updatedAt: new Date() })
    .where(eq(secrets.id, id))
    .returning({
      id: secrets.id,
      key: secrets.key,
      value: secrets.value,
      description: secrets.description,
      updatedAt: secrets.updatedAt,
    })

  return Response.json(row)
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  await db
    .delete(secrets)
    .where(and(eq(secrets.id, id), eq(secrets.userId, session.user.id)))

  return Response.json({ ok: true })
}
