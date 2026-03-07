import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { createEntity, listEntities } from '@/lib/db/entities-service';

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entities = await listEntities(session.user.id);
    return NextResponse.json(entities);
  } catch (error) {
    console.error('Error fetching entities:', error);
    return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, type = 'document' } = await req.json();
    const entity = await createEntity(session.user.id, name, type);
    return Response.json(entity);
  } catch (error) {
    console.error('Error creating entity:', error);
    return Response.json({ error: 'Failed to create entity' }, { status: 500 });
  }
}
