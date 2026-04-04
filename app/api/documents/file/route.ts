import { headers } from 'next/headers';
import { getDocumentById } from '@/lib/db/entities-service';
import { getAuthenticatedUser } from '@/lib/request-auth';

export async function GET(req: Request) {
  try {
    const currentUser = await getAuthenticatedUser(await headers());
    if (!currentUser) return new Response('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get('documentId');
    if (!documentId) return new Response('Document ID required', { status: 400 });

    const document = await getDocumentById(documentId);
    const html = document?.versions?.[document.currentVersion]?.html;
    if (!document || !html) return new Response('Document not found', { status: 404 });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving document HTML:', error);
    return new Response('Failed to serve document', { status: 500 });
  }
}
