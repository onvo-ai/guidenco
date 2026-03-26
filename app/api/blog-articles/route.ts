import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getBlogArticleById, upsertBlogArticle } from '@/lib/db/entities-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const articleId = req.nextUrl.searchParams.get('articleId');
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 });

  const article = await getBlogArticleById(articleId);
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(article);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { articleId, content, title, bannerImage, tags } = await req.json();
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 });

  const article = await upsertBlogArticle(articleId, {
    ...(content !== undefined ? { content } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(bannerImage !== undefined ? { bannerImage } : {}),
    ...(tags !== undefined ? { tags } : {}),
    createVersion: content !== undefined,
  });
  return NextResponse.json(article);
}
