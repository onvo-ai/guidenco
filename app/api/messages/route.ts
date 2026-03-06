import { NextResponse } from 'next/server';
import { getProjectMessages, getAssetMessages, getVideoMessages } from '@/lib/db/projects-service';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const section = searchParams.get('section'); // 'asset' | 'video' | null (artwork)

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    let messages;
    if (section === 'asset') {
      messages = await getAssetMessages(projectId);
    } else if (section === 'video') {
      messages = await getVideoMessages(projectId);
    } else {
      messages = await getProjectMessages(projectId);
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
