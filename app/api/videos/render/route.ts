import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getVideoById, upsertVideo, updateVideoVersion } from '@/lib/db/entities-service';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const MEDIA_EXTENSION_RE = /https?:\/\/[^\s'"`,)>\]]+\.(?:mp4|mp3|webm|mov|ogg|wav|avi|m4v|m4a)(?:\?[^\s'"`,)>\]]*)?/gi;

async function predownloadExternalAssets(code: string): Promise<string> {
  const urls = [...new Set(code.match(MEDIA_EXTENSION_RE) || [])];
  if (urls.length === 0) return code;

  const { uploadFile, ensureBucket } = await import('@/lib/storage');
  await ensureBucket();

  const replacements: Record<string, string> = {};
  await Promise.all(
    urls.map(async (url) => {
      try {
        console.log(`[Render] Pre-downloading asset: ${url}`);
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) { console.warn(`[Render] Skip ${url}: HTTP ${res.status}`); return; }
        const buffer = Buffer.from(await res.arrayBuffer());
        const rawExt = url.split('?')[0].split('.').pop() ?? 'mp4';
        const ext = rawExt.toLowerCase();
        const mimeType = ext === 'mp3' || ext === 'wav' || ext === 'ogg' || ext === 'm4a'
          ? `audio/${ext === 'mp3' ? 'mpeg' : ext}`
          : `video/${ext}`;
        const key = `render-assets/${randomUUID()}.${ext}`;
        await uploadFile(key, buffer, mimeType);
        const { getSignedUrl } = await import('@/lib/storage');
        // Use signed URL so private S3 buckets work; local MinIO also supports signed URLs
        const accessibleUrl = process.env.S3_ENDPOINT
          ? `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET || 'guidenco'}/${key}`
          : await getSignedUrl(key, 3600 * 2); // 2h — enough for any render
        replacements[url] = accessibleUrl;
        console.log(`[Render] Asset cached: ${url} -> ${accessibleUrl}`);
      } catch (e) {
        console.error(`[Render] Error downloading asset ${url}:`, e);
      }
    })
  );

  let result = code;
  for (const [original, replacement] of Object.entries(replacements)) {
    result = result.split(original).join(replacement);
  }
  return result;
}

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { videoId, versionId } = await req.json();
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  const video = await getVideoById(videoId);
  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

  // Use the requested version, or fall back to the latest one
  const targetVersion = versionId
    ? video.versions.find((v) => v.id === versionId)
    : video.versions[video.versions.length - 1];

  if (!targetVersion?.remotionCode) {
    return NextResponse.json({ error: 'No version code found' }, { status: 404 });
  }

  await updateVideoVersion(targetVersion.id, { status: 'rendering' });
  await upsertVideo(videoId, { status: 'rendering', createVersion: false });

  const tempDir = join(tmpdir(), `remotion-${randomUUID()}`);
  try {
    let bundle: any, renderMedia: any, getCompositions: any;
    try {
      const bundler = await import('@remotion/bundler');
      const renderer = await import('@remotion/renderer');
      bundle = bundler.bundle;
      renderMedia = renderer.renderMedia;
      getCompositions = renderer.getCompositions;
    } catch {
      await updateVideoVersion(targetVersion.id, { status: 'error' });
      await upsertVideo(videoId, { status: 'error', createVersion: false });
      return NextResponse.json({ error: 'Remotion is not installed. Run: npm install remotion @remotion/bundler @remotion/renderer' }, { status: 501 });
    }

    mkdirSync(tempDir, { recursive: true });
    const indexContent = `
import { registerRoot, Composition } from 'remotion';
import { MainComposition } from './composition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={${targetVersion.durationInFrames}}
        fps={${targetVersion.fps}}
        width={${targetVersion.width}}
        height={${targetVersion.height}}
      />
    </>
  );
};

registerRoot(RemotionRoot);
`.trim();

    const remotionCode = await predownloadExternalAssets(targetVersion.remotionCode);

    writeFileSync(join(tempDir, 'index.tsx'), indexContent);
    writeFileSync(join(tempDir, 'composition.tsx'), remotionCode);
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'remotion-render', version: '1.0.0', dependencies: { remotion: '*', react: '*', 'react-dom': '*' } }));

    const chromiumOptions = {
      disableWebSecurity: true, // Required to allow fetching cross-origin media assets during headless render
      gl: 'swiftshader' as const,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-crash-reporter',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--single-process',
        '--disable-gpu-sandbox',
      ],
    };
    const browserExecutable = process.env.REMOTION_CHROME_EXECUTABLE_PATH || undefined;

    const bundled = await bundle({ entryPoint: join(tempDir, 'index.tsx') });
    const compositions = await getCompositions(bundled, {
      chromiumOptions,
      browserExecutable,
    });
    const composition = compositions.find((c: any) => c.id === 'MainComposition');
    if (!composition) throw new Error('Composition not found after bundling');

    const outputPath = join(tempDir, 'output.mp4');
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      chromiumOptions,
      browserExecutable,
    });

    const { uploadFile, ensureBucket } = await import('@/lib/storage');
    await ensureBucket();
    const fileKey = `videos/${videoId}-${targetVersion.id}-${randomUUID()}.mp4`;
    const { readFileSync } = await import('fs');
    const videoBuffer = readFileSync(outputPath);
    await uploadFile(fileKey, videoBuffer, 'video/mp4');

    const videoUrl = `/api/videos/file?key=${encodeURIComponent(fileKey)}`;
    await updateVideoVersion(targetVersion.id, { videoUrl, status: 'done' });
    await upsertVideo(videoId, { videoUrl, status: 'done', createVersion: false });
    return NextResponse.json({ success: true, videoUrl, versionId: targetVersion.id });
  } catch (error: any) {
    console.error('Video render error:', error);
    await updateVideoVersion(targetVersion.id, { status: 'error' });
    await upsertVideo(videoId, { status: 'error', createVersion: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { }
  }
}
