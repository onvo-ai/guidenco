import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getAssetById, upsertAsset } from '@/lib/db/entities-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assetId = req.nextUrl.searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  const asset = await getAssetById(assetId);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(asset);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assetId, svgContent, title, width, height } = await req.json();
  if (!assetId) {
    return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  }

  const asset = await upsertAsset(assetId, {
    ...(svgContent !== undefined ? { svgContent } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    createVersion: svgContent !== undefined,
  });
  return NextResponse.json(asset);
}
