import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getVideoById, upsertVideo, deleteVideoVersion } from '@/lib/db/entities-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  const video = await getVideoById(videoId);
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(video);
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const versionId = req.nextUrl.searchParams.get('versionId');
  if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 });

  await deleteVideoVersion(versionId);
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { videoId, ...data } = body;
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  const video = await upsertVideo(videoId, data);
  return NextResponse.json(video);
}
