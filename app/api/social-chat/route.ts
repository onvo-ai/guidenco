import { tool } from 'ai';
import { z } from 'zod';
import {
  saveSocialPostMessage,
  getSocialPostById,
  getVideoById,
  createPendingSocialPostVersion,
  updateSocialPostVersionContent,
  updateSocialPostVersionStatus,
  updateSocialPostVersionUsage,
} from '@/lib/db/entities-service';
import { db } from '@/lib/db';
import { assets, videos, brandAssets } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { createEntityChatHandler } from '@/lib/chat/entity-chat-handler';

export const maxDuration = 60;

const DEFAULT_MODEL = 'google/gemini-3-flash-preview';
const ALLOWED_MODELS = [
  'google/gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemini-3.1-pro-preview',
];

const PLATFORM_GUIDELINES: Record<string, string> = {
  twitter: `Twitter/X guidelines:
- Max 280 characters per tweet (aim for engaging threads if longer)
- Use 1-2 relevant hashtags maximum
- Conversational, punchy, direct tone
- Start with a hook — a bold statement, question, or surprising fact
- End with a call to action or question to drive engagement`,

  linkedin: `LinkedIn guidelines:
- Optimal length: 150-300 words for posts
- Professional yet personal tone
- Start with a strong hook (first line is critical — it's shown before "see more")
- Use line breaks for readability (avoid walls of text)
- Add 3-5 relevant hashtags at the end
- Share insights, lessons, or stories — not just promotions`,

  instagram: `Instagram guidelines:
- Caption length: 125-150 characters for preview, up to 2200 total
- Use emojis strategically to add personality
- Include a call to action (e.g., "Save this post", "Tag a friend", "Link in bio")
- Add 5-15 relevant hashtags (can be in first comment or at end of caption)
- Conversational and relatable tone`,

  facebook: `Facebook guidelines:
- Optimal length: 40-80 words for feed posts
- Can be longer for storytelling or detailed posts
- Use questions to drive comments and engagement
- Include a clear call to action
- Conversational and community-oriented tone
- 1-2 hashtags maximum`,
};

async function searchStockPhotosImpl(query: string, orientation: 'landscape' | 'portrait' | 'square' = 'landscape') {
  const pexelsKey = process.env.PEXELS_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const photos: Array<{ source: string; url: string; alt: string; photographer: string; width?: number; height?: number }> = [];

  await Promise.all([
    (async () => {
      if (!pexelsKey) return;
      try {
        const params = new URLSearchParams({ query, per_page: '4', orientation });
        const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: pexelsKey } });
        if (!res.ok) return;
        const data = await res.json() as any;
        for (const p of data.photos) {
          photos.push({ source: 'pexels', url: p.src.large2x || p.src.large, alt: p.alt || query, photographer: p.photographer, width: p.width, height: p.height });
        }
      } catch { /* skip */ }
    })(),
    (async () => {
      if (!unsplashKey) return;
      try {
        const params = new URLSearchParams({ query, per_page: '4', orientation: orientation === 'square' ? 'squarish' : orientation });
        const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
        if (!res.ok) return;
        const data = await res.json() as any;
        for (const p of data.results) {
          photos.push({ source: 'unsplash', url: p.urls.regular, alt: p.alt_description || query, photographer: p.user.name, width: p.width, height: p.height });
        }
      } catch { /* skip */ }
    })(),
  ]);

  if (photos.length === 0) return { success: false, error: 'No API keys configured. Please set PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY.' };
  return { success: true, totalResults: photos.length, photos };
}

export const POST = createEntityChatHandler({
  entityIdParam: 'postId',
  defaultModel: DEFAULT_MODEL,
  allowedModels: ALLOWED_MODELS,
  envModelKeys: ['SOCIAL_MODEL'],
  maxSteps: 6,
  messageConversionMode: 'text-only',
  loadEntity: getSocialPostById,
  createPendingVersion: async (postId, opts) => {
    const { versionId } = await createPendingSocialPostVersion(postId, opts);
    return versionId;
  },
  markVersionError: (versionId) => updateSocialPostVersionStatus(versionId, 'error'),
  saveMessage: saveSocialPostMessage,
  updateVersionUsage: updateSocialPostVersionUsage,
  buildSystemPrompt: ({ chainContext, entity }) => {
    const platform = (entity as any)?.platform || 'linkedin';
    const platformGuidelines = PLATFORM_GUIDELINES[platform] || PLATFORM_GUIDELINES.linkedin;

    return `You are an expert social media strategist and copywriter. Your job is to write high-performing, platform-optimized social media posts.${chainContext}

Current platform: ${platform.toUpperCase()}

${platformGuidelines}

General guidelines:
- Match the energy and format of the platform
- Write authentically — avoid corporate jargon
- Focus on value: educate, entertain, inspire, or inform
- Use storytelling when appropriate
- Drive engagement through questions, CTAs, or relatable scenarios

MEDIA ATTACHMENT:
Always try to attach relevant media to the post. Follow this priority:
1. Search the user's brand assets (searchBrandAssets) for a relevant image or video first
2. Search the user's generated assets (searchAssets) for something relevant
3. Search their videos (searchVideos) if a video would work well
4. If nothing suitable exists, use searchStockPhotos to find a high-quality stock photo
Always pass mediaUrl and mediaType when calling savePost.

Hashtag handling: Extract hashtags as a separate array (without the # symbol). Do NOT include hashtags inline in the content text.

When a user asks you to CREATE a post:
1. Search for relevant media (brand assets → assets → videos → stock photos)
2. Write the post content
3. Call savePost EXACTLY ONCE with the complete content, hashtags, and media
4. End with a brief explanation of your approach

When a user asks to MODIFY an existing post:
1. Use getPost to read the current content
2. Make the requested changes
3. Call savePost EXACTLY ONCE with the updated content
4. End with a brief explanation of what changed

CRITICAL: Call savePost EXACTLY ONCE per user request. Never call it twice.`;
  },
  buildTools: ({ entityId, tracker, userPrompt, parentVersionId, entity, organizationId }) => {
    const platform = (entity as any)?.platform || 'linkedin';
    const parentVersion = parentVersionId ? entity?.versions.find(v => v.id === parentVersionId) : undefined;
    const parentContent: string | undefined = (parentVersion as any)?.content;

    return {
      savePost: tool({
        description: 'Save the social media post content. This immediately updates the editor preview.',
        inputSchema: z.object({
          content: z.string().describe('The social media post text (without hashtags)'),
          title: z.string().optional().describe('Short internal title for the post'),
          platform: z.enum(['twitter', 'linkedin', 'instagram', 'facebook']).optional(),
          hashtags: z.array(z.string()).optional().describe('List of hashtags WITHOUT the # symbol'),
          mediaUrl: z.string().optional().describe('URL of the image or video to attach'),
          mediaType: z.enum(['image', 'video']).optional(),
        }),
        execute: async ({ content, title, platform: newPlatform, hashtags, mediaUrl, mediaType }: {
          content: string; title?: string; platform?: string; hashtags?: string[]; mediaUrl?: string; mediaType?: string;
        }) => {
          try {
            await updateSocialPostVersionContent(tracker.currentVersionId, { content, title, platform: newPlatform, hashtags, mediaUrl, mediaType });
            tracker.contentSaved = true;
            return { success: true, message: 'Post saved successfully' };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
      getPost: tool({
        description: 'Get the current social post content so you can modify or improve it.',
        inputSchema: z.object({}),
        execute: async () => {
          const post = await getSocialPostById(entityId);
          if (!post || post.currentVersion < 0) return { success: false, error: 'No post content yet' };
          return { success: true, title: post.title, platform: post.platform, content: post.content, hashtags: post.hashtags || [], mediaUrl: post.mediaUrl, mediaType: post.mediaType };
        },
      }),
      searchAssets: tool({
        description: "Search the user's generated SVG assets by title.",
        inputSchema: z.object({ query: z.string().optional() }),
        execute: async ({ query }: { query?: string }) => {
          try {
            let rows = await db.select().from(assets).where(eq(assets.organizationId, organizationId)).orderBy(desc(assets.updatedAt)).limit(20);
            if (query) rows = rows.filter(a => a.title.toLowerCase().includes(query.toLowerCase()));
            return { success: true, assets: rows.map(a => ({ id: a.id, title: a.title, url: `/api/asset-generations/file?assetId=${a.id}`, mimeType: 'image/svg+xml' })) };
          } catch (error: any) { return { success: false, error: error.message }; }
        },
      }),
      searchVideos: tool({
        description: "Search the user's generated videos by title.",
        inputSchema: z.object({ query: z.string().optional() }),
        execute: async ({ query }: { query?: string }) => {
          try {
            let rows = await db.select().from(videos).where(eq(videos.organizationId, organizationId)).orderBy(desc(videos.updatedAt)).limit(20);
            if (query) rows = rows.filter(v => v.title.toLowerCase().includes(query.toLowerCase()));
            const detailed = await Promise.all(rows.map(v => getVideoById(v.id)));
            return { success: true, videos: detailed.filter((v): v is NonNullable<typeof v> => !!v?.videoUrl).map(v => ({ id: v.id, title: v.title, url: v.videoUrl, status: v.status })) };
          } catch (error: any) { return { success: false, error: error.message }; }
        },
      }),
      searchBrandAssets: tool({
        description: "Search the team's brand asset warehouse by title or description.",
        inputSchema: z.object({ query: z.string().optional(), mimeTypeFilter: z.string().optional() }),
        execute: async ({ query, mimeTypeFilter }: { query?: string; mimeTypeFilter?: string }) => {
          try {
            let rows = await db.select().from(brandAssets).where(eq(brandAssets.organizationId, organizationId)).orderBy(desc(brandAssets.createdAt)).limit(50);
            if (query) rows = rows.filter(a => a.title.toLowerCase().includes(query.toLowerCase()) || (a.description || '').toLowerCase().includes(query.toLowerCase()));
            if (mimeTypeFilter) rows = rows.filter(a => a.mimeType.startsWith(mimeTypeFilter));
            return { success: true, assets: rows.map(a => ({ id: a.id, title: a.title, description: a.description, url: a.fileUrl, mimeType: a.mimeType })) };
          } catch (error: any) { return { success: false, error: error.message }; }
        },
      }),
      searchStockPhotos: tool({
        description: 'Search for high-quality stock photos from Pexels and Unsplash simultaneously.',
        inputSchema: z.object({
          query: z.string().describe('Search keywords'),
          orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('Image orientation — use "square" for Instagram'),
        }),
        execute: async ({ query, orientation }: { query: string; orientation?: 'landscape' | 'portrait' | 'square' }) => {
          return searchStockPhotosImpl(query, orientation ?? (platform === 'instagram' ? 'square' : 'landscape'));
        },
      }),
    };
  },
});
