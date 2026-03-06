import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getProjectAsset, upsertProjectAsset } from '@/lib/db/projects-service';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const asset = await getProjectAsset(projectId);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(asset);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, svgContent, title } = await req.json();
  if (!projectId || !svgContent) {
    return NextResponse.json({ error: 'projectId and svgContent required' }, { status: 400 });
  }

  const asset = await upsertProjectAsset(projectId, svgContent, title);
  return NextResponse.json(asset);
}
