import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

interface BundleCacheEntry {
  bundleDir: string;
  hash: string;
}

// Use globals to survive Next.js hot reloads in dev
declare global {
  var _remotionBundleCache: Map<string, BundleCacheEntry> | undefined;
  var _remotionBundlingPromises: Map<string, Promise<string>> | undefined;
}

const bundleCache: Map<string, BundleCacheEntry> = (global._remotionBundleCache ??= new Map());
const bundlingPromises: Map<string, Promise<string>> = (global._remotionBundlingPromises ??= new Map());

function codeHash(code: string, width: number, height: number, durationInFrames: number, fps: number) {
  return createHash('sha256')
    .update(`${code}:${width}:${height}:${durationInFrames}:${fps}`)
    .digest('hex')
    .slice(0, 16);
}

export function getPreviewHash(video: {
  remotionCode: string;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
}) {
  return codeHash(video.remotionCode, video.width, video.height, video.durationInFrames, video.fps);
}

export function getCachedBundle(videoId: string, hash: string): string | null {
  const cached = bundleCache.get(videoId);
  if (cached?.hash === hash && existsSync(join(cached.bundleDir, 'index.html'))) {
    return cached.bundleDir;
  }
  return null;
}

export async function ensurePreviewBundle(
  videoId: string,
  video: {
    remotionCode: string;
    width: number;
    height: number;
    durationInFrames: number;
    fps: number;
  }
): Promise<string> {
  const hash = codeHash(video.remotionCode, video.width, video.height, video.durationInFrames, video.fps);

  const cached = getCachedBundle(videoId, hash);
  if (cached) return cached;

  // Deduplicate concurrent requests for the same video
  const existing = bundlingPromises.get(videoId);
  if (existing) return existing;

  const promise = (async () => {
    const { bundle } = await import('@remotion/bundler');

    const srcDir = join(tmpdir(), `remotion-preview-src-${videoId}-${hash}`);
    mkdirSync(srcDir, { recursive: true });

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

    writeFileSync(join(srcDir, 'index.tsx'), indexContent);
    writeFileSync(join(srcDir, 'composition.tsx'), video.remotionCode);

    const publicPath = `/api/videos/preview/${videoId}/`;
    const bundleDir = await bundle({
      entryPoint: join(srcDir, 'index.tsx'),
      publicPath,
    });

    bundleCache.set(videoId, { bundleDir, hash });
    bundlingPromises.delete(videoId);
    return bundleDir;
  })();

  bundlingPromises.set(videoId, promise);

  try {
    return await promise;
  } catch (err) {
    bundlingPromises.delete(videoId);
    throw err;
  }
}
