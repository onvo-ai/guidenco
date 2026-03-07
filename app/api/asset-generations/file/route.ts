import { auth } from '@/lib/auth';
import { getAssetById } from '@/lib/db/entities-service';
import { headers } from 'next/headers';

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return new Response('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');
    if (!assetId) return new Response('assetId required', { status: 400 });

    const asset = await getAssetById(assetId);
    const svgContent = asset?.svgContent || asset?.versions?.[asset.currentVersion]?.svgContent;
    if (!svgContent) return new Response('Not found', { status: 404 });

    return new Response(svgContent, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving asset SVG:', error);
    return new Response('Failed to serve SVG asset', { status: 500 });
  }
}
