import { NextResponse } from 'next/server';
import { getDocumentMessages, getAssetMessages, getVideoMessages } from '@/lib/db/entities-service';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');
  const assetId = searchParams.get('assetId');
  const videoId = searchParams.get('videoId');

  if (!documentId && !assetId && !videoId) {
    return NextResponse.json({ error: 'An entity ID is required' }, { status: 400 });
  }

  try {
    let messages;
    if (assetId) {
      messages = await getAssetMessages(assetId);
    } else if (videoId) {
      messages = await getVideoMessages(videoId);
    } else {
      messages = await getDocumentMessages(documentId!);
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
