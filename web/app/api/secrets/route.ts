import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { secrets } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

const KEY_RE = /^[A-Z][A-Z0-9_]*$/

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: secrets.id,
      key: secrets.key,
      value: secrets.value,
      description: secrets.description,
      updatedAt: secrets.updatedAt,
    })
    .from(secrets)
    .where(eq(secrets.userId, session.user.id))
    .orderBy(secrets.key)

  return Response.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await getSession(req.headers)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Reject duplicate key for this user
  const [existing] = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.userId, session.user.id), eq(secrets.key, key)))
    .limit(1)
  if (existing) {
    return Response.json({ error: `Secret "${key}" already exists.` }, { status: 409 })
  }

  const [row] = await db
    .insert(secrets)
    .values({ userId: session.user.id, key, value, description })
    .returning({
      id: secrets.id,
      key: secrets.key,
      value: secrets.value,
      description: secrets.description,
      updatedAt: secrets.updatedAt,
    })

  return Response.json(row)
}
