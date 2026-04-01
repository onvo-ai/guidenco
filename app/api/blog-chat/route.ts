import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, UIMessage, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  saveBlogArticleMessage,
  upsertBlogArticle,
  getBlogArticleById,
  getBlogArticleVersionById,
} from "@/lib/db/entities-service";
import { headers } from "next/headers";
import { getUserCredits, deductCreditsForUsage } from "@/lib/billing";
import { getAuthenticatedUser } from "@/lib/request-auth";
import { db } from "@/lib/db";
import { assets, videos, brandAssets, videoVersions } from "@/lib/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { getOrCreateOrganizationId } from "@/lib/organization";

export const maxDuration = 60;
const DEFAULT_MODEL = "google/gemini-2.5-pro";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const articleId = searchParams.get("articleId");
    const parentVersionId = searchParams.get("parentVersionId") ?? undefined;

    if (!articleId) return new Response("Article ID required", { status: 400 });

    const currentUser = await getAuthenticatedUser(await headers());
    if (!currentUser) return new Response("Unauthorized", { status: 401 });

    const organizationId = await getOrCreateOrganizationId(currentUser.id);

    const creditBalance = await getUserCredits(organizationId);
    if (creditBalance <= 0) {
      return new Response("Insufficient credits", { status: 402 });
    }

    const {
      messages,
      prompt: directPrompt,
      parentPromptChain,
    }: {
      messages: UIMessage[];
      prompt?: string;
      parentPromptChain?: string[];
    } = await req.json();

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user") {
      await saveBlogArticleMessage(
        articleId,
        "user",
        lastUserMessage.parts || [],
      );
    }

    const userPrompt =
      directPrompt ??
      (lastUserMessage?.parts?.find((p: any) => p.type === "text") as any)
        ?.text ??
      "";

    // Get parent version content for branching context
    let parentContent: string | undefined;
    if (parentVersionId) {
      const parentVersion = await getBlogArticleVersionById(parentVersionId);
      parentContent = parentVersion?.content;
    }

    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
      return new Response("OPENROUTER_API_KEY is not configured.", {
        status: 500,
      });
    }

    const openrouter = createOpenRouter({ apiKey });
    const configuredModel = (
      process.env.BLOG_MODEL ||
      process.env.OPENROUTER_MODEL ||
      ""
    ).trim();
    const modelId = configuredModel || DEFAULT_MODEL;
    const currentArticle = await getBlogArticleById(articleId);

    const convertedMessages = messages.map((msg: any) => {
      const textParts = (msg.parts || [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => ({ type: "text" as const, text: p.text }));
      return {
        role: msg.role,
        content:
          textParts.length > 0
            ? textParts
            : [{ type: "text" as const, text: "" }],
      };
    });

    const chainContext =
      parentPromptChain && parentPromptChain.length > 0
        ? `\n\nVERSION HISTORY CONTEXT:\nThis version branches from a prior generation. The prompts used to create previous versions in this branch (oldest first) were:\n${parentPromptChain.map((p, i) => `${i + 1}. "${p}"`).join("\n")}\n\nUse this context to understand the creative direction and build upon it appropriately.`
        : "";

    const result = streamText({
      model: openrouter(modelId),
      messages: convertedMessages as any,
      stopWhen: stepCountIs(6),
      system: `You are an expert content writer and blog strategist.${chainContext} Your job is to write high-quality, engaging blog articles in Markdown format.

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
      tools: {
        saveArticle: tool({
          description:
            "Save the blog article content in Markdown. This immediately updates the editor preview.",
          inputSchema: z.object({
            content: z
              .string()
              .describe("The complete blog article in Markdown format"),
            title: z
              .string()
              .optional()
              .describe("Short title for the article"),
            bannerImage: z
              .string()
              .optional()
              .describe(
                "URL of the banner image to display at the top of the article",
              ),
            tags: z
              .array(z.string())
              .optional()
              .describe(
                'List of topic tags for the article (e.g., ["react", "performance", "web"])',
              ),
          }),
          execute: async ({
            content,
            title,
            bannerImage,
            tags,
          }: {
            content: string;
            title?: string;
            bannerImage?: string;
            tags?: string[];
          }) => {
            try {
              await upsertBlogArticle(articleId, {
                content,
                title,
                bannerImage,
                tags,
                createVersion: true,
                prompt: userPrompt,
                parentVersionId,
              });
              return { success: true, message: "Article saved successfully" };
            } catch (error: any) {
              console.error("Error saving blog article:", error);
              return { success: false, error: error.message };
            }
          },
        }),
        getArticle: tool({
          description:
            "Get the current blog article content so you can modify or improve it.",
          inputSchema: z.object({}),
          execute: async () => {
            const content =
              parentContent ?? (await getBlogArticleById(articleId))?.content;
            if (!content)
              return { success: false, error: "No article content yet" };
            const article = await getBlogArticleById(articleId);
            return {
              success: true,
              title: article?.title,
              content,
              bannerImage: article?.bannerImage,
              tags: article?.tags || [],
            };
          },
        }),
        searchAssets: tool({
          description:
            "Search the user's generated SVG assets by title. Returns a list of assets with their URLs that can be embedded in the article.",
          inputSchema: z.object({
            query: z
              .string()
              .optional()
              .describe("Optional search term to filter assets by title"),
          }),
          execute: async ({ query }: { query?: string }) => {
            try {
              let rows;
              if (query) {
                rows = await db
                  .select()
                  .from(assets)
                  .where(eq(assets.organizationId, organizationId))
                  .orderBy(desc(assets.updatedAt))
                  .limit(20);
                rows = rows.filter((a) =>
                  a.title.toLowerCase().includes(query.toLowerCase()),
                );
              } else {
                rows = await db
                  .select()
                  .from(assets)
                  .where(eq(assets.organizationId, organizationId))
                  .orderBy(desc(assets.updatedAt))
                  .limit(20);
              }
              return {
                success: true,
                assets: rows.map((a) => ({
                  id: a.id,
                  title: a.title,
                  url: `/api/asset-generations/file?assetId=${a.id}`,
                  mimeType: "image/svg+xml",
                })),
              };
            } catch (error: any) {
              return { success: false, error: error.message };
            }
          },
        }),
        searchVideos: tool({
          description:
            "Search the user's generated videos by title. Returns a list of rendered videos with their URLs.",
          inputSchema: z.object({
            query: z
              .string()
              .optional()
              .describe("Optional search term to filter videos by title"),
          }),
          execute: async ({ query }: { query?: string }) => {
            try {
              let rows = await db
                .select({
                  id: videos.id,
                  title: videos.title,
                  videoUrl: videoVersions.videoUrl,
                  status: videoVersions.status,
                })
                .from(videos)
                .leftJoin(
                  videoVersions,
                  and(
                    eq(videos.id, videoVersions.videoId),
                    eq(videos.currentVersion, videoVersions.version),
                  ),
                )
                .where(eq(videos.organizationId, organizationId))
                .orderBy(desc(videos.updatedAt))
                .limit(20);

              if (query)
                rows = rows.filter((v) =>
                  v.title.toLowerCase().includes(query.toLowerCase()),
                );
              return {
                success: true,
                videos: rows
                  .filter((v) => v.videoUrl)
                  .map((v) => ({
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
          description:
            "Search the team's brand asset warehouse (uploaded images, logos, videos, PDFs) by title or description.",
          inputSchema: z.object({
            query: z
              .string()
              .optional()
              .describe("Optional search term to filter brand assets"),
            mimeTypeFilter: z
              .string()
              .optional()
              .describe(
                'Filter by MIME type prefix (e.g., "image/", "video/")',
              ),
          }),
          execute: async ({
            query,
            mimeTypeFilter,
          }: {
            query?: string;
            mimeTypeFilter?: string;
          }) => {
            try {
              if (!organizationId) return { success: true, assets: [] };

              let rows = await db
                .select()
                .from(brandAssets)
                .where(eq(brandAssets.organizationId, organizationId))
                .orderBy(desc(brandAssets.createdAt))
                .limit(50);
              if (query)
                rows = rows.filter(
                  (a) =>
                    a.title.toLowerCase().includes(query.toLowerCase()) ||
                    (a.description || "")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                );
              if (mimeTypeFilter)
                rows = rows.filter((a) =>
                  a.mimeType.startsWith(mimeTypeFilter),
                );

              return {
                success: true,
                assets: rows.map((a) => ({
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
          description:
            "Search for high-quality stock photos from both Pexels and Unsplash simultaneously. Use this when the user has no suitable existing assets. Returns combined results from both platforms.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                'Search keywords describing the image needed (e.g., "technology workspace", "nature landscape", "business meeting")',
              ),
            orientation: z
              .enum(["landscape", "portrait", "square"])
              .optional()
              .describe(
                'Image orientation — use "landscape" for banner images',
              ),
          }),
          execute: async ({
            query,
            orientation,
          }: {
            query: string;
            orientation?: "landscape" | "portrait" | "square";
          }) => {
            try {
              const pexelsKey = process.env.PEXELS_API_KEY;
              const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
              const orient = orientation || "landscape";
              const photos: Array<{
                source: string;
                url: string;
                alt: string;
                photographer: string;
                width?: number;
                height?: number;
              }> = [];

              await Promise.all([
                // Pexels
                (async () => {
                  if (!pexelsKey) return;
                  try {
                    const params = new URLSearchParams({
                      query,
                      per_page: "4",
                      orientation: orient,
                    });
                    const res = await fetch(
                      `https://api.pexels.com/v1/search?${params}`,
                      {
                        headers: { Authorization: pexelsKey },
                      },
                    );
                    if (!res.ok) return;
                    const data = (await res.json()) as {
                      photos: Array<{
                        width: number;
                        height: number;
                        photographer: string;
                        alt: string;
                        src: { large2x: string; large: string };
                      }>;
                    };
                    for (const p of data.photos) {
                      photos.push({
                        source: "pexels",
                        url: p.src.large2x || p.src.large,
                        alt: p.alt || query,
                        photographer: p.photographer,
                        width: p.width,
                        height: p.height,
                      });
                    }
                  } catch {
                    /* skip on error */
                  }
                })(),
                // Unsplash
                (async () => {
                  if (!unsplashKey) return;
                  try {
                    const params = new URLSearchParams({
                      query,
                      per_page: "4",
                      orientation: orient === "square" ? "squarish" : orient,
                    });
                    const res = await fetch(
                      `https://api.unsplash.com/search/photos?${params}`,
                      {
                        headers: { Authorization: `Client-ID ${unsplashKey}` },
                      },
                    );
                    if (!res.ok) return;
                    const data = (await res.json()) as {
                      results: Array<{
                        width: number;
                        height: number;
                        user: { name: string };
                        alt_description: string;
                        urls: { regular: string; full: string };
                      }>;
                    };
                    for (const p of data.results) {
                      photos.push({
                        source: "unsplash",
                        url: p.urls.regular,
                        alt: p.alt_description || query,
                        photographer: p.user.name,
                        width: p.width,
                        height: p.height,
                      });
                    }
                  } catch {
                    /* skip on error */
                  }
                })(),
              ]);

              if (photos.length === 0) {
                return {
                  success: false,
                  error:
                    "No API keys configured. Please set PEXELS_API_KEY and/or UNSPLASH_ACCESS_KEY in your environment variables.",
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
        await deductCreditsForUsage(organizationId, usage).catch(() => {});
        try {
          const parts: any[] = [];
          if (toolCalls && toolResults) {
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i] as any;
              const tr = toolResults[i] as any;
              parts.push({
                type: `tool-${tc.toolName}`,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args,
                output: tr?.result || tr,
              });
            }
          }
          if (text) parts.push({ type: "text", text });
          if (parts.length > 0)
            await saveBlogArticleMessage(articleId, "assistant", parts);
        } catch (e) {
          console.error("Error saving blog article message:", e);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Blog chat route failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown blog chat error";
    return new Response(`Blog chat failed: ${message}`, { status: 500 });
  }
}
