import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getFileBuffer } from '@/lib/storage';

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return new Response('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    if (!key) return new Response('File key required', { status: 400 });

    const buffer = await getFileBuffer(key);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.length.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving video:', error);
    return new Response('Failed to serve video', { status: 500 });
  }
}
