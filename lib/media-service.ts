import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockPhoto {
  source: 'unsplash' | 'pexels';
  url: string;
  thumbnailUrl: string;
  preview: string; // base64 data URI (resized PNG ~200px wide)
  alt: string;
  photographer: string;
  width: number;
  height: number;
}

export interface StockVideo {
  source: 'pexels';
  id: number;
  title: string;
  url: string;
  thumbnailUrl: string;
  duration: number;
  width: number;
  height: number;
}

export interface AudioClip {
  source: 'freesound';
  id: number;
  name: string;
  downloadUrl: string;
  previewUrl: string;
  duration: number;
  tags: string[];
  license: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch an image URL and resize it to ~200px wide, returning a base64 data URI. */
async function fetchAndResizeToPreview(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';
    const buffer = Buffer.from(await res.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(200, undefined, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${resized.toString('base64')}`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Unsplash
// ---------------------------------------------------------------------------

export async function searchUnsplashPhotos(
  query: string,
  options: { perPage?: number; orientation?: 'landscape' | 'portrait' | 'squarish' } = {}
): Promise<StockPhoto[]> {
  const apiKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(options.perPage ?? 5, 10)),
    ...(options.orientation ? { orientation: options.orientation } : {}),
  });

  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      results: Array<{
        width: number;
        height: number;
        user: { name: string };
        alt_description: string | null;
        description: string | null;
        urls: { regular: string; small: string; thumb: string };
      }>;
    };

    const photos = await Promise.all(
      data.results.map(async (p) => {
        const preview = await fetchAndResizeToPreview(p.urls.small || p.urls.thumb);
        return {
          source: 'unsplash' as const,
          url: p.urls.regular,
          thumbnailUrl: p.urls.small,
          preview,
          alt: p.alt_description || p.description || query,
          photographer: p.user.name,
          width: p.width,
          height: p.height,
        };
      })
    );
    return photos;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pexels — Photos
// ---------------------------------------------------------------------------

export async function searchPexelsPhotos(
  query: string,
  options: { perPage?: number; orientation?: 'landscape' | 'portrait' | 'square' } = {}
): Promise<StockPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(options.perPage ?? 5, 10)),
    ...(options.orientation ? { orientation: options.orientation } : {}),
  });

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      photos: Array<{
        width: number;
        height: number;
        photographer: string;
        alt: string;
        src: { large2x: string; large: string; medium: string; small: string };
      }>;
    };

    const photos = await Promise.all(
      data.photos.map(async (p) => {
        const preview = await fetchAndResizeToPreview(p.src.small || p.src.medium);
        return {
          source: 'pexels' as const,
          url: p.src.large2x || p.src.large,
          thumbnailUrl: p.src.small,
          preview,
          alt: p.alt || query,
          photographer: p.photographer,
          width: p.width,
          height: p.height,
        };
      })
    );
    return photos;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pexels — Videos
// ---------------------------------------------------------------------------

export async function searchPexelsVideos(
  query: string,
  options: { perPage?: number; orientation?: 'landscape' | 'portrait' | 'square' } = {}
): Promise<StockVideo[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(options.perPage ?? 5, 10)),
    ...(options.orientation ? { orientation: options.orientation } : {}),
  });

  try {
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      videos: Array<{
        id: number;
        duration: number;
        width: number;
        height: number;
        url: string;
        image: string;
        video_files: Array<{ quality: string; file_type: string; link: string; width: number | null; height: number | null }>;
      }>;
    };

    return data.videos.map((v) => {
      // Pick the best HD file, or fall back to the first one
      const hd = v.video_files.find((f) => f.quality === 'hd' && f.file_type === 'video/mp4')
        || v.video_files.find((f) => f.file_type === 'video/mp4')
        || v.video_files[0];
      return {
        source: 'pexels' as const,
        id: v.id,
        title: `Pexels video ${v.id}`,
        url: hd?.link || v.url,
        thumbnailUrl: v.image,
        duration: v.duration,
        width: v.width,
        height: v.height,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Freesound
// ---------------------------------------------------------------------------

export async function searchFreesoundAudio(
  query: string,
  options: { pageSize?: number } = {}
): Promise<AudioClip[]> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    query,
    page_size: String(Math.min(options.pageSize ?? 5, 15)),
    fields: 'id,name,duration,tags,license,previews,download',
    token: apiKey,
  });

  try {
    const res = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
    if (!res.ok) return [];

    const data = await res.json() as {
      results: Array<{
        id: number;
        name: string;
        duration: number;
        tags: string[];
        license: string;
        previews: { 'preview-hq-mp3': string; 'preview-lq-mp3': string };
        download: string;
      }>;
    };

    return data.results.map((r) => ({
      source: 'freesound' as const,
      id: r.id,
      name: r.name,
      downloadUrl: r.download,
      previewUrl: r.previews?.['preview-hq-mp3'] || r.previews?.['preview-lq-mp3'] || '',
      duration: r.duration,
      tags: r.tags || [],
      license: r.license,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Combined photo search (Unsplash + Pexels)
// ---------------------------------------------------------------------------

export async function searchAllPhotos(
  query: string,
  options: {
    perPage?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
  } = {}
): Promise<StockPhoto[]> {
  const unsplashOrient = options.orientation === 'square' ? 'squarish' : (options.orientation as 'landscape' | 'portrait' | undefined);

  const [unsplash, pexels] = await Promise.all([
    searchUnsplashPhotos(query, { perPage: options.perPage, orientation: unsplashOrient }),
    searchPexelsPhotos(query, { perPage: options.perPage, orientation: options.orientation }),
  ]);
  return [...unsplash, ...pexels];
}
