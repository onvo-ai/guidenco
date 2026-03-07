import { NextResponse } from 'next/server';
import { getDocumentById, updateDocumentSettings } from '@/lib/db/entities-service';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');

  if (!documentId) {
    return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
  }

  try {
    const document = await getDocumentById(documentId);
    if (!document) {
      return NextResponse.json({ error: 'No document found' }, { status: 404 });
    }
    return NextResponse.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { documentId, title, width, height } = await req.json();
    if (!documentId || typeof title !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
      return NextResponse.json({ error: 'documentId, title, width, and height are required' }, { status: 400 });
    }

    const document = await updateDocumentSettings(documentId, title, width, height);
    return NextResponse.json(document);
  } catch (error) {
    console.error('Error saving document settings:', error);
    return NextResponse.json({ error: 'Failed to save document settings' }, { status: 500 });
  }
}
