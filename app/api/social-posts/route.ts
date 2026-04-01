import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getSocialPostById, upsertSocialPost } from '@/lib/db/entities-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const postId = req.nextUrl.searchParams.get('postId');
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const post = await getSocialPostById(postId);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(post);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId, content, title, platform, hashtags, mediaUrl, mediaType } = await req.json();
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const post = await upsertSocialPost(postId, {
    ...(content !== undefined ? { content } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(platform !== undefined ? { platform } : {}),
    ...(hashtags !== undefined ? { hashtags } : {}),
    ...(mediaUrl !== undefined ? { mediaUrl } : {}),
    ...(mediaType !== undefined ? { mediaType } : {}),
    createVersion: content !== undefined,
  });
  return NextResponse.json(post);
}
