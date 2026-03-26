import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { saveSocialPostMessage, upsertSocialPost, getSocialPostById, getSocialPostVersionById } from '@/lib/db/entities-service';
import { headers } from 'next/headers';
import { getUserCredits, deductCreditsForUsage } from '@/lib/billing';
import { getAuthenticatedUser } from '@/lib/request-auth';
import { db } from '@/lib/db';
import { assets, videos, brandAssets } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getOrCreateOrganizationId } from '@/lib/organization';

export const maxDuration = 60;
const DEFAULT_MODEL = 'google/gemini-2.5-pro';

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


export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');
    const parentVersionId = searchParams.get('parentVersionId') ?? undefined;

    if (!postId) return new Response('Post ID required', { status: 400 });

    const currentUser = await getAuthenticatedUser(await headers());
    if (!currentUser) return new Response('Unauthorized', { status: 401 });

    const organizationId = await getOrCreateOrganizationId(currentUser.id);

    const creditBalance = await getUserCredits(organizationId);
    if (creditBalance <= 0) {
      return new Response('Insufficient credits', { status: 402 });
    }

    const { messages, prompt: directPrompt, parentPromptChain }: { messages: UIMessage[]; prompt?: string; parentPromptChain?: string[] } = await req.json();

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === 'user') {
      await saveSocialPostMessage(postId, 'user', lastUserMessage.parts || []);
    }

    const userPrompt = directPrompt ?? (lastUserMessage?.parts?.find((p: any) => p.type === 'text') as any)?.text ?? '';

    let parentContent: string | undefined;
    if (parentVersionId) {
      const parentVersion = await getSocialPostVersionById(parentVersionId);
      parentContent = parentVersion?.content;
    }

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) {
      return new Response('OPENROUTER_API_KEY is not configured.', { status: 500 });
    }

    const openrouter = createOpenRouter({ apiKey });
    const configuredModel = (process.env.SOCIAL_MODEL || process.env.OPENROUTER_MODEL || '').trim();
    const modelId = configuredModel || DEFAULT_MODEL;
    const currentPost = await getSocialPostById(postId);

    const platform = currentPost?.platform || 'linkedin';
    const platformGuidelines = PLATFORM_GUIDELINES[platform] || PLATFORM_GUIDELINES.linkedin;

    const convertedMessages = messages.map((msg: any) => {
      const textParts = (msg.parts || [])
        .filter((p: any) => p.type === 'text')
        .map((p: any) => ({ type: 'text' as const, text: p.text }));
      return {
        role: msg.role,
        content: textParts.length > 0 ? textParts : [{ type: 'text' as const, text: '' }],
      };
    });

    const chainContext = parentPromptChain && parentPromptChain.length > 0
      ? `\n\nVERSION HISTORY CONTEXT:\nThis version branches from a prior generation. The prompts used to create previous versions in this branch (oldest first) were:\n${parentPromptChain.map((p, i) => `${i + 1}. "${p}"`).join('\n')}\n\nUse this context to understand the creative direction and build upon it.`
      : '';

    const result = streamText({
      model: openrouter(modelId),
      messages: convertedMessages as any,
      stopWhen: stepCountIs(6),
      system: `You are an expert social media strategist and copywriter. Your job is to write high-performing, platform-optimized social media posts.${chainContext}

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

CRITICAL: Call savePost EXACTLY ONCE per user request. Never call it twice.`,
      tools: {
        savePost: tool({
          description: 'Save the social media post content. This immediately updates the editor preview.',
          inputSchema: z.object({
            content: z.string().describe('The social media post text (without hashtags — those go in the hashtags field)'),
            title: z.string().optional().describe('Short internal title for the post'),
            platform: z.enum(['twitter', 'linkedin', 'instagram', 'facebook']).optional().describe('The social media platform'),
            hashtags: z.array(z.string()).optional().describe('List of hashtags WITHOUT the # symbol (e.g., ["react", "webdev", "javascript"])'),
            mediaUrl: z.string().optional().describe('URL of the image or video to attach to this post'),
            mediaType: z.enum(['image', 'video']).optional().describe('Type of the attached media'),
          }),
          execute: async ({ content, title, platform: newPlatform, hashtags, mediaUrl, mediaType }: { content: string; title?: string; platform?: string; hashtags?: string[]; mediaUrl?: string; mediaType?: string }) => {
            try {
              await upsertSocialPost(postId, { content, title, platform: newPlatform, hashtags, mediaUrl, mediaType, createVersion: true, prompt: userPrompt, parentVersionId });
              return { success: true, message: 'Post saved successfully' };
            } catch (error: any) {
              console.error('Error saving social post:', error);
              return { success: false, error: error.message };
            }
          },
        }),
        getPost: tool({
          description: 'Get the current social post content so you can modify or improve it.',
          inputSchema: z.object({}),
          execute: async () => {
            const post = await getSocialPostById(postId);
            if (!post || post.currentVersion < 0) return { success: false, error: 'No post content yet' };
            return {
              success: true,
              title: post.title,
              platform: post.platform,
              content: post.content,
              hashtags: post.hashtags || [],
              mediaUrl: post.mediaUrl,
              mediaType: post.mediaType,
            };
          },
        }),
        searchAssets: tool({
          description: 'Search the user\'s generated SVG assets by title. Returns a list of assets with their URLs that can be attached to the post.',
          inputSchema: z.object({
            query: z.string().optional().describe('Optional search term to filter assets by title'),
          }),
          execute: async ({ query }: { query?: string }) => {
            try {
              let rows = await db.select().from(assets).where(eq(assets.organizationId, organizationId)).orderBy(desc(assets.updatedAt)).limit(20);
              if (query) rows = rows.filter(a => a.title.toLowerCase().includes(query.toLowerCase()));
              return {
                success: true,
                assets: rows.map(a => ({
                  id: a.id,
                  title: a.title,
                  url: `/api/asset-generations/file?assetId=${a.id}`,
                  mimeType: 'image/svg+xml',
                })),
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),
        searchVideos: tool({
          description: 'Search the user\'s generated videos by title. Returns rendered videos with their URLs for attaching to a post.',
          inputSchema: z.object({
            query: z.string().optional().describe('Optional search term to filter videos by title'),
          }),
          execute: async ({ query }: { query?: string }) => {
            try {
              let rows = await db.select().from(videos).where(eq(videos.organizationId, organizationId)).orderBy(desc(videos.updatedAt)).limit(20);
              if (query) rows = rows.filter(v => v.title.toLowerCase().includes(query.toLowerCase()));
              return {
                success: true,
                videos: rows.filter(v => v.videoUrl).map(v => ({
                  id: v.id,
                  title: v.title,
                  url: v.videoUrl,
                  status: v.status,
                })),
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),
        searchBrandAssets: tool({
          description: 'Search the team\'s brand asset warehouse (uploaded images, logos, videos) by title or description. Great for finding branded media to attach.',
          inputSchema: z.object({
            query: z.string().optional().describe('Optional search term to filter brand assets'),
            mimeTypeFilter: z.string().optional().describe('Filter by MIME type prefix (e.g., "image/", "video/")'),
          }),
          execute: async ({ query, mimeTypeFilter }: { query?: string; mimeTypeFilter?: string }) => {
            try {
              if (!organizationId) return { success: true, assets: [] };

              let rows = await db.select().from(brandAssets).where(eq(brandAssets.organizationId, organizationId)).orderBy(desc(brandAssets.createdAt)).limit(50);
              if (query) rows = rows.filter(a => a.title.toLowerCase().includes(query.toLowerCase()) || (a.description || '').toLowerCase().includes(query.toLowerCase()));
              if (mimeTypeFilter) rows = rows.filter(a => a.mimeType.startsWith(mimeTypeFilter));

              return {
                success: true,
                assets: rows.map(a => ({
                  id: a.id,
                  title: a.title,
                  description: a.description,
                  url: a.fileUrl,
                  mimeType: a.mimeType,
                })),
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),
        searchStockPhotos: tool({
          description: 'Search for high-quality stock photos from both Pexels and Unsplash simultaneously. Use this when the user has no suitable existing assets. Returns combined results from both platforms.',
          inputSchema: z.object({
            query: z.string().describe('Search keywords describing the image needed (e.g., "technology workspace", "business team meeting")'),
            orientation: z.enum(['landscape', 'portrait', 'square']).optional().describe('Image orientation — use "square" for Instagram, "landscape" for others'),
          }),
          execute: async ({ query, orientation }: { query: string; orientation?: 'landscape' | 'portrait' | 'square' }) => {
            try {
              const pexelsKey = process.env.PEXELS_API_KEY;
              const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
              const orient = orientation || (platform === 'instagram' ? 'square' : 'landscape');
              const photos: Array<{ source: string; url: string; alt: string; photographer: string; width?: number; height?: number }> = [];

              await Promise.all([
                // Pexels
                (async () => {
                  if (!pexelsKey) return;
                  try {
                    const params = new URLSearchParams({ query, per_page: '4', orientation: orient });
                    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
                      headers: { Authorization: pexelsKey },
                    });
                    if (!res.ok) return;
                    const data = await res.json() as {
                      photos: Array<{ width: number; height: number; photographer: string; alt: string; src: { large2x: string; large: string } }>;
                    };
                    for (const p of data.photos) {
                      photos.push({ source: 'pexels', url: p.src.large2x || p.src.large, alt: p.alt || query, photographer: p.photographer, width: p.width, height: p.height });
                    }
                  } catch { /* skip on error */ }
                })(),
                // Unsplash
                (async () => {
                  if (!unsplashKey) return;
                  try {
                    const params = new URLSearchParams({ query, per_page: '4', orientation: orient === 'square' ? 'squarish' : orient });
                    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
                      headers: { Authorization: `Client-ID ${unsplashKey}` },
                    });
                    if (!res.ok) return;
                    const data = await res.json() as {
                      results: Array<{ width: number; height: number; user: { name: string }; alt_description: string; urls: { regular: string; full: string } }>;
                    };
                    for (const p of data.results) {
                      photos.push({ source: 'unsplash', url: p.urls.regular, alt: p.alt_description || query, photographer: p.user.name, width: p.width, height: p.height });
                    }
                  } catch { /* skip on error */ }
                })(),
              ]);

              if (photos.length === 0) {
                return {
                  success: false,
                  error: 'No API keys configured. Please set PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY in your environment variables.',
                };
              }

              return { success: true, totalResults: photos.length, photos };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),
      },
      onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
        await deductCreditsForUsage(organizationId, usage).catch(() => { });
        try {
          const parts: any[] = [];
          if (toolCalls && toolResults) {
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i] as any;
              const tr = toolResults[i] as any;
              parts.push({ type: `tool-${tc.toolName}`, toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.args, output: tr?.result || tr });
            }
          }
          if (text) parts.push({ type: 'text', text });
          if (parts.length > 0) await saveSocialPostMessage(postId, 'assistant', parts);
        } catch (e) {
          console.error('Error saving social post message:', e);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Social chat route failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown social chat error';
    return new Response(`Social chat failed: ${message}`, { status: 500 });
  }
}
