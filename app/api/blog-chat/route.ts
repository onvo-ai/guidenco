import { tool } from 'ai';
import { z } from 'zod';
import {
  saveBlogArticleMessage,
  getBlogArticleById,
  getVideoById,
  createPendingBlogArticleVersion,
  updateBlogArticleVersionContent,
  updateBlogArticleVersionStatus,
  updateBlogArticleVersionUsage,
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
  entityIdParam: 'articleId',
  defaultModel: DEFAULT_MODEL,
  allowedModels: ALLOWED_MODELS,
  envModelKeys: ['BLOG_MODEL'],
  maxSteps: 6,
  messageConversionMode: 'text-only',
  loadEntity: getBlogArticleById,
  createPendingVersion: createPendingBlogArticleVersion,
  markVersionError: (versionId) => updateBlogArticleVersionStatus(versionId, 'error'),
  saveMessage: saveBlogArticleMessage,
  updateVersionUsage: updateBlogArticleVersionUsage,
  buildSystemPrompt: ({ chainContext }) => `You are an expert content writer and blog strategist.${chainContext} Your job is to write high-quality, engaging blog articles in Markdown format.

Guidelines:
- Write well-structured articles with clear headings (##, ###), paragraphs, bullet points, and code blocks where relevant
- Use a professional yet engaging tone appropriate for the topic
- Include an introduction, body sections, and a conclusion
- Optimize for readability: short sentences, active voice, clear transitions
- Always output complete Markdown content — not just an outline
- Use bold (**text**) and italic (*text*) for emphasis where appropriate
- Include practical examples, tips, or insights whenever possible

BANNER IMAGE — MANDATORY:
Every article MUST have a banner image. Follow this priority order:
1. Search the user's brand assets (searchBrandAssets) for a relevant image first
2. Search the user's generated assets (searchAssets) for something relevant
3. If nothing suitable is found, use searchStockPhotos to find a high-quality stock photo
You MUST always pass a bannerImage URL when calling saveArticle. Never save without one.

When a user asks you to CREATE a blog article:
1. Search for a relevant banner image (brand assets → generated assets → stock photos)
2. Write the full article in Markdown
3. Call saveArticle EXACTLY ONCE with the complete content, title, bannerImage, and tags
4. End with a brief text summary of what you wrote

When a user asks to MODIFY or IMPROVE an article:
1. Use getArticle to read the current content
2. Make the requested changes
3. Call saveArticle EXACTLY ONCE with the updated content
4. End with a brief explanation of what changed

CRITICAL: Call saveArticle EXACTLY ONCE per user request. Never call it twice.`,
  buildTools: ({ entityId, tracker, userPrompt, parentVersionId, modelId, entity, organizationId }) => {
    const parentVersion = parentVersionId ? entity?.versions.find(v => v.id === parentVersionId) : undefined;
    const parentContent: string | undefined = (parentVersion as any)?.content;

    return {
      saveArticle: tool({
        description: 'Save the blog article content in Markdown. This immediately updates the editor preview.',
        inputSchema: z.object({
          content: z.string().describe('The complete blog article in Markdown format'),
          title: z.string().optional().describe('Short title for the article'),
          bannerImage: z.string().optional().describe('URL of the banner image'),
          tags: z.array(z.string()).optional().describe('List of topic tags'),
        }),
        execute: async ({ content, title, bannerImage, tags }: { content: string; title?: string; bannerImage?: string; tags?: string[] }) => {
          try {
            await updateBlogArticleVersionContent(tracker.currentVersionId, { content, title, bannerImage, tags });
            tracker.contentSaved = true;
            return { success: true, message: 'Article saved successfully' };
          } catch (error: any) {
            return { success: false, error: error.message };
          }
        },
      }),
      getArticle: tool({
        description: 'Get the current blog article content so you can modify or improve it.',
        inputSchema: z.object({}),
        execute: async () => {
          const content = parentContent ?? (await getBlogArticleById(entityId))?.content;
          if (!content) return { success: false, error: 'No article content yet' };
          const article = await getBlogArticleById(entityId);
          return { success: true, title: article?.title, content, bannerImage: (article as any)?.bannerImage, tags: (article as any)?.tags || [] };
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
          orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('Image orientation — use "landscape" for banner images'),
        }),
        execute: async ({ query, orientation }: { query: string; orientation?: 'landscape' | 'portrait' | 'square' }) => {
          return searchStockPhotosImpl(query, orientation);
        },
      }),
    };
  },
});
