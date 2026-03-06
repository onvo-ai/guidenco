import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getProjectVideo, upsertProjectVideo } from '@/lib/db/projects-service';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export const maxDuration = 300; // 5 minutes for rendering

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const video = await getProjectVideo(projectId);
  if (!video || !video.remotionCode) {
    return NextResponse.json({ error: 'No video code found' }, { status: 404 });
  }

  // Mark as rendering
  await upsertProjectVideo(projectId, { status: 'rendering' });

  const tempDir = join(tmpdir(), `remotion-${randomUUID()}`);
  try {
    // Try to dynamically import Remotion renderer
    let bundle: any, renderMedia: any, getCompositions: any;
    try {
      const bundler = await import('@remotion/bundler');
      const renderer = await import('@remotion/renderer');
      bundle = bundler.bundle;
      renderMedia = renderer.renderMedia;
      getCompositions = renderer.getCompositions;
    } catch {
      // Remotion not installed — mark as error and return helpful message
      await upsertProjectVideo(projectId, { status: 'error' });
      return NextResponse.json(
        {
          error: 'Remotion is not installed. Run: npm install remotion @remotion/bundler @remotion/renderer',
        },
        { status: 501 }
      );
    }

    mkdirSync(tempDir, { recursive: true });

    // Write Remotion project files
    const indexContent = `
import { registerRoot, Composition } from 'remotion';
import { MainComposition } from './composition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={${video.durationInFrames}}
        fps={${video.fps}}
        width={${video.width}}
        height={${video.height}}
      />
    </>
  );
};

registerRoot(RemotionRoot);
`.trim();

    writeFileSync(join(tempDir, 'index.tsx'), indexContent);
    writeFileSync(join(tempDir, 'composition.tsx'), video.remotionCode);
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'remotion-render', version: '1.0.0', dependencies: { remotion: '*', react: '*', 'react-dom': '*' } })
    );

    // Bundle the Remotion project
    const bundled = await bundle({
      entryPoint: join(tempDir, 'index.tsx'),
    });

    // Get compositions
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c: any) => c.id === 'MainComposition');
    if (!composition) throw new Error('Composition not found after bundling');

    // Render to file
    const outputPath = join(tempDir, 'output.mp4');
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
    });

    // Upload to storage
    const { uploadFile, ensureBucket } = await import('@/lib/storage');
    await ensureBucket();
    const fileKey = `videos/${projectId}-${randomUUID()}.mp4`;
    const { readFileSync } = await import('fs');
    const videoBuffer = readFileSync(outputPath);
    await uploadFile(fileKey, videoBuffer, 'video/mp4');

    const videoUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/assets/image?key=${encodeURIComponent(fileKey)}`;

    await upsertProjectVideo(projectId, { videoUrl, status: 'done' });
    return NextResponse.json({ success: true, videoUrl });
  } catch (error: any) {
    console.error('Video render error:', error);
    await upsertProjectVideo(projectId, { status: 'error' });
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}
