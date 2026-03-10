import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getVideoById } from '@/lib/db/entities-service';
import { ensurePreviewBundle } from '@/lib/remotion-preview';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoId } = await req.json();
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  const video = await getVideoById(videoId);
  if (!video || !video.remotionCode) {
    return NextResponse.json({ error: 'No video code found' }, { status: 404 });
  }

  try {
    await ensurePreviewBundle(videoId, {
      remotionCode: video.remotionCode,
      width: video.width,
      height: video.height,
      durationInFrames: video.durationInFrames,
      fps: video.fps,
    });
    return NextResponse.json({ ready: true });
  } catch (error: any) {
    console.error('Preview bundle error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
