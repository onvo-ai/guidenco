import { NextResponse } from 'next/server';
import { getDocumentMessages, getAssetMessages, getVideoMessages, getBlogArticleMessages, getSocialPostMessages } from '@/lib/db/entities-service';
import type { EntityKind } from '@/lib/db/entities-service';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const versionId = searchParams.get('versionId');
  const entityType = searchParams.get('entityType') as EntityKind | null;

  if (!versionId || !entityType) {
    return NextResponse.json({ error: 'versionId and entityType are required' }, { status: 400 });
  }

  try {
    let messages;
    if (entityType === 'asset') {
      messages = await getAssetMessages(versionId);
    } else if (entityType === 'video') {
      messages = await getVideoMessages(versionId);
    } else if (entityType === 'blog_article') {
      messages = await getBlogArticleMessages(versionId);
    } else if (entityType === 'social_post') {
      messages = await getSocialPostMessages(versionId);
    } else {
      messages = await getDocumentMessages(versionId);
    }

    const uiMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.content,
      createdAt: msg.createdAt,
    }));

    return NextResponse.json(uiMessages);
  } catch (error) {
    console.error('Error loading messages:', error);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}
