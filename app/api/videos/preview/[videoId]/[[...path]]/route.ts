import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { getCachedBundle } from '@/lib/remotion-preview';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.map': 'application/json',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string; path?: string[] }> }
) {
  const { videoId, path = [] } = await params;

  // Hash is the first path segment when code changes — used as cache-buster
  // Fall back to finding the bundle from global cache
  const bundleDir = getCachedBundle(videoId, '') || findBundleDir(videoId);

  if (!bundleDir) {
    return new NextResponse('Preview not ready. POST /api/videos/preview to build it.', {
      status: 404,
    });
  }

  const filePath = path.length === 0 ? 'index.html' : join(...path);
  const fullPath = join(bundleDir, filePath);

  if (!existsSync(fullPath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  // Inject script into index.html to hide the "Render via CLI" button
  if (ext === '.html') {
    let html = readFileSync(fullPath, 'utf-8');
    const hideScript = `<script>
(function(){
  var n=0;
  function hide(){
    n++;
    var found=false;
    document.querySelectorAll('button').forEach(function(el){
      if((el.innerText||'').trim().toLowerCase()==='render via cli'){
        var p=el.closest('li')||el.parentElement;
        if(p&&p!==document.body)p.style.display='none';
        else el.style.display='none';
        found=true;
      }
    });
    if(!found&&n<300)requestAnimationFrame(hide);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide);
  else hide();
})();
</script>`;
    html = html.replace('</body>', hideScript + '</body>');
    return new NextResponse(html, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' },
    });
  }

  const content = readFileSync(fullPath);
  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// Fallback: get any cached bundle for this videoId (ignores hash mismatch)
function findBundleDir(videoId: string): string | null {
  // Access global cache directly since we allow serving stale bundles for file requests
  const cache = global._remotionBundleCache;
  const entry = cache?.get(videoId);
  if (entry && existsSync(join(entry.bundleDir, 'index.html'))) {
    return entry.bundleDir;
  }
  return null;
}
