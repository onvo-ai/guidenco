import { NextResponse } from 'next/server';
import { getProjectArtwork } from '@/lib/db/projects-service';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    const artwork = await getProjectArtwork(projectId);
    
    if (!artwork) {
      return NextResponse.json({ error: 'No artwork found' }, { status: 404 });
    }

    return NextResponse.json(artwork);
  } catch (error) {
    console.error('Error fetching artwork:', error);
    return NextResponse.json({ error: 'Failed to fetch artwork' }, { status: 500 });
  }
}
