import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getProjectVideo, upsertProjectVideo } from '@/lib/db/projects-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const video = await getProjectVideo(projectId);
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(video);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { projectId, ...data } = body;
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const video = await upsertProjectVideo(projectId, data);
  return NextResponse.json(video);
}
