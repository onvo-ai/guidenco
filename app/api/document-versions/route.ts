import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getDocumentById, updateDocumentVersionStatus } from '@/lib/db/entities-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const documentId = req.nextUrl.searchParams.get('documentId');
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });

  const document = await getDocumentById(documentId);
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(document, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { versionId, status } = await req.json();
  if (!versionId || !status) return NextResponse.json({ error: 'versionId and status required' }, { status: 400 });
  if (!['generating', 'done', 'error'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  await updateDocumentVersionStatus(versionId, status);
  return NextResponse.json({ ok: true });
}
