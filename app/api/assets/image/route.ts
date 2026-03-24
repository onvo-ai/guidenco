import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { brandAssets } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getFileBuffer } from '@/lib/storage';
import { getUserTeamId } from '@/app/api/settings/assets/route';
import sharp from 'sharp';

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return new Response('Unauthorized', { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('id');
    if (!assetId) return new Response('Asset ID required', { status: 400 });

    const teamId = await getUserTeamId(session.user.id);
    if (!teamId) return new Response('No team found', { status: 403 });

    const [asset] = await db
      .select()
      .from(brandAssets)
      .where(and(eq(brandAssets.id, assetId), eq(brandAssets.teamId, teamId)))
      .limit(1);

    if (!asset) return new Response('Not found', { status: 404 });

    const buffer = await getFileBuffer(asset.fileKey);

    // Convert SVG to PNG for universal browser compatibility.
    // SVGs loaded in <img> tags are sandboxed and often fail to render
    // when they reference external resources or use certain features.
    if (asset.mimeType === 'image/svg+xml') {
      try {
        const pngBuffer = await sharp(Buffer.from(buffer)).png().toBuffer();
        return new Response(new Uint8Array(pngBuffer), {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'private, max-age=86400',
          },
        });
      } catch (svgError) {
        console.error('SVG→PNG conversion failed, serving raw SVG:', svgError);
        // Fall through to serve the raw SVG if conversion fails
      }
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': asset.mimeType,
        // Cache aggressively – asset content never changes (only deleted)
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error serving asset image:', error);
    return new Response('Failed to serve asset', { status: 500 });
  }
}
