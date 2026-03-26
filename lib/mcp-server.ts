import { randomUUID } from 'crypto';
import { desc, eq, inArray, and } from 'drizzle-orm';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { assets, documents, videos, blogArticles, socialPosts, organizationMembers } from '@/lib/db/schema';
import { createEntity, getAssetById, getDocumentById, getVideoById, getBlogArticleById, getSocialPostById } from '@/lib/db/entities-service';
import { getSignedUrl } from '@/lib/storage';

function absoluteUrl(baseUrl: string, pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, baseUrl).toString();
}

function dataUrl(mimeType: string, value: string) {
  return `data:${mimeType};base64,${Buffer.from(value).toString('base64')}`;
}

async function runGenerationRequest(params: {
  baseUrl: string;
  token: string;
  path: string;
  prompt: string;
}) {
  const response = await fetch(absoluteUrl(params.baseUrl, params.path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: params.prompt }],
        },
      ],
    }),
    cache: 'no-store',
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || `Generation request failed with ${response.status}`);
  }
}

function createTextResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

async function getOrgUserIds(organizationId: string | null, fallbackUserId: string): Promise<string[]> {
  if (!organizationId) return [fallbackUserId];
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));
  const ids = members.map((m) => m.userId);
  return ids.length > 0 ? ids : [fallbackUserId];
}

async function canAccessByOrg(resourceUserId: string, organizationId: string | null, requestingUserId: string): Promise<boolean> {
  if (resourceUserId === requestingUserId) return true;
  if (!organizationId) return false;
  const [member] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, resourceUserId)))
    .limit(1);
  return !!member;
}

export function createGuidencoMcpServer(params: {
  userId: string;
  organizationId: string | null;
  accessToken: string;
  baseUrl: string;
}) {
  const server = new McpServer(
    {
      name: 'guidenco-mcp',
      version: '1.0.0',
      title: 'Guidenco MCP',
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: 'Use these tools to list, download, and create Guidenco assets, documents, and videos for the authenticated user.',
    }
  );

  server.registerTool(
    'list_assets',
    {
      title: 'List Assets',
      description: 'List the user’s generated SVG assets.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const userIds = await getOrgUserIds(params.organizationId, params.userId);
      const rows = await db
        .select()
        .from(assets)
        .where(inArray(assets.userId, userIds))
        .orderBy(desc(assets.updatedAt));

      const assetList = rows.map((asset) => ({
        id: asset.id,
        title: asset.title,
        width: asset.width,
        height: asset.height,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        fileUrl: dataUrl('image/svg+xml', asset.svgContent),
        downloadUrl: absoluteUrl(params.baseUrl, `/api/asset-generations/file?assetId=${encodeURIComponent(asset.id)}`),
      }));

      const assetLines = rows.length
        ? [`Found ${rows.length} asset${rows.length === 1 ? '' : 's'}:`, ...assetList.map((a) => `- "${a.title}" (id: ${a.id})`)]
        : ['No assets found.'];

      return createTextResult(assetLines.join('\n'), { assets: assetList });
    }
  );

  server.registerTool(
    'list_documents',
    {
      title: 'List Documents',
      description: 'List the user’s generated documents.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const userIds = await getOrgUserIds(params.organizationId, params.userId);
      const rows = await db
        .select()
        .from(documents)
        .where(inArray(documents.userId, userIds))
        .orderBy(desc(documents.updatedAt));

      const documentList = rows.map((document) => ({
        id: document.id,
        title: document.title,
        width: document.width,
        height: document.height,
        currentVersion: document.currentVersion,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        downloadUrl: absoluteUrl(params.baseUrl, `/api/documents/file?documentId=${encodeURIComponent(document.id)}`),
        appUrl: absoluteUrl(params.baseUrl, `/app/documents/${document.id}`),
      }));

      const documentLines = rows.length
        ? [`Found ${rows.length} document${rows.length === 1 ? '' : 's'}:`, ...documentList.map((d) => `- "${d.title}" (id: ${d.id})`)]
        : ['No documents found.'];

      return createTextResult(documentLines.join('\n'), { documents: documentList });
    }
  );

  server.registerTool(
    'list_videos',
    {
      title: 'List Videos',
      description: 'List the user’s generated videos.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const userIds = await getOrgUserIds(params.organizationId, params.userId);
      const rows = await db
        .select()
        .from(videos)
        .where(inArray(videos.userId, userIds))
        .orderBy(desc(videos.updatedAt));

      const videoList = rows.map((video) => ({
        id: video.id,
        title: video.title,
        width: video.width,
        height: video.height,
        durationInFrames: video.durationInFrames,
        fps: video.fps,
        status: video.status,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
        videoUrl: video.videoUrl ? absoluteUrl(params.baseUrl, video.videoUrl) : null,
        appUrl: absoluteUrl(params.baseUrl, `/app/videos/${video.id}`),
      }));

      const videoLines = rows.length
        ? [`Found ${rows.length} video${rows.length === 1 ? '' : 's'}:`, ...videoList.map((v) => `- "${v.title}" (id: ${v.id}, status: ${v.status})`)]
        : ['No videos found.'];

      return createTextResult(videoLines.join('\n'), { videos: videoList });
    }
  );

  server.registerTool(
    'download_asset',
    {
      title: 'Download Asset',
      description: 'Return a generated SVG asset and a usable file URL.',
      inputSchema: {
        assetId: z.string().describe('The asset id to download'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ assetId }) => {
      const asset = await getAssetById(assetId);
      if (!asset || !await canAccessByOrg(asset.userId, params.organizationId, params.userId) || !asset.svgContent) {
        return { isError: true, content: [{ type: 'text', text: 'Asset not found.' }] };
      }

      const downloadUrl = absoluteUrl(params.baseUrl, `/api/asset-generations/file?assetId=${encodeURIComponent(asset.id)}`);
      const fileUrl = dataUrl('image/svg+xml', asset.svgContent);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Downloaded asset "${asset.title}".`,
          },
          {
            type: 'resource' as const,
            resource: {
              uri: downloadUrl,
              mimeType: 'image/svg+xml',
              text: asset.svgContent,
            },
          },
        ],
        structuredContent: {
          id: asset.id,
          title: asset.title,
          mimeType: 'image/svg+xml',
          downloadUrl,
          fileUrl,
        },
      };
    }
  );

  server.registerTool(
    'download_document',
    {
      title: 'Download Document',
      description: 'Return a generated document HTML file and a usable file URL.',
      inputSchema: {
        documentId: z.string().describe('The document id to download'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ documentId }) => {
      const document = await getDocumentById(documentId);
      if (!document || !await canAccessByOrg(document.userId, params.organizationId, params.userId)) {
        return { isError: true, content: [{ type: 'text', text: 'Document not found.' }] };
      }

      const html = document.versions?.[document.currentVersion]?.html;
      if (!html) {
        return { isError: true, content: [{ type: 'text', text: 'Document has no saved HTML yet.' }] };
      }

      const downloadUrl = absoluteUrl(params.baseUrl, `/api/documents/file?documentId=${encodeURIComponent(document.id)}`);
      const fileUrl = dataUrl('text/html', html);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Downloaded document "${document.title}".`,
          },
          {
            type: 'resource' as const,
            resource: {
              uri: downloadUrl,
              mimeType: 'text/html',
              text: html,
            },
          },
        ],
        structuredContent: {
          id: document.id,
          title: document.title,
          mimeType: 'text/html',
          downloadUrl,
          fileUrl,
          appUrl: absoluteUrl(params.baseUrl, `/app/documents/${document.id}`),
        },
      };
    }
  );

  server.registerTool(
    'download_video',
    {
      title: 'Download Video',
      description: 'Return a rendered video download URL and the file URL the LLM can use.',
      inputSchema: {
        videoId: z.string().describe('The video id to download'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ videoId }) => {
      const video = await getVideoById(videoId);
      if (!video || !await canAccessByOrg(video.userId, params.organizationId, params.userId)) {
        return { isError: true, content: [{ type: 'text', text: 'Video not found.' }] };
      }
      if (!video.videoUrl) {
        return { isError: true, content: [{ type: 'text', text: 'Video has not been rendered yet.' }] };
      }

      const relativeUrl = video.videoUrl;
      const absoluteDownloadUrl = absoluteUrl(params.baseUrl, relativeUrl);
      const key = new URL(absoluteDownloadUrl).searchParams.get('key');
      const fileUrl = key ? await getSignedUrl(key) : absoluteDownloadUrl;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Downloaded video "${video.title}".`,
          },
          {
            type: 'resource_link' as const,
            uri: fileUrl,
            name: video.title,
            mimeType: 'video/mp4',
            title: video.title,
          },
        ],
        structuredContent: {
          id: video.id,
          title: video.title,
          mimeType: 'video/mp4',
          downloadUrl: absoluteDownloadUrl,
          fileUrl,
          status: video.status,
          appUrl: absoluteUrl(params.baseUrl, `/app/videos/${video.id}`),
        },
      };
    }
  );

  server.registerTool(
    'create_asset',
    {
      title: 'Create Asset',
      description: 'Create a new generated SVG asset from a prompt.',
      inputSchema: {
        prompt: z.string().describe('A prompt describing the asset to generate'),
        title: z.string().optional().describe('Optional title to use for the new asset'),
      },
    },
    async ({ prompt, title }) => {
      const entity = await createEntity(params.userId, title || 'Untitled Asset', 'asset');
      await runGenerationRequest({
        baseUrl: params.baseUrl,
        token: params.accessToken,
        path: `/api/asset-chat?assetId=${encodeURIComponent(entity.id)}`,
        prompt,
      });

      const asset = await getAssetById(entity.id);
      if (!asset) {
        return { isError: true, content: [{ type: 'text', text: 'Asset generation finished, but the asset could not be loaded.' }] };
      }

      const fileUrl = asset.svgContent ? dataUrl('image/svg+xml', asset.svgContent) : null;
      const downloadUrl = absoluteUrl(params.baseUrl, `/api/asset-generations/file?assetId=${encodeURIComponent(asset.id)}`);

      return createTextResult(`Created asset "${asset.title}" (id: ${asset.id}).`, {
        id: asset.id,
        title: asset.title,
        fileUrl,
        downloadUrl,
        appUrl: absoluteUrl(params.baseUrl, `/app/assets/${asset.id}`),
      });
    }
  );

  server.registerTool(
    'create_document',
    {
      title: 'Create Document',
      description: 'Create a new generated document from a prompt.',
      inputSchema: {
        prompt: z.string().describe('A prompt describing the document to generate'),
        title: z.string().optional().describe('Optional title to use for the new document'),
      },
    },
    async ({ prompt, title }) => {
      const entity = await createEntity(params.userId, title || 'Untitled Document', 'document');
      await runGenerationRequest({
        baseUrl: params.baseUrl,
        token: params.accessToken,
        path: `/api/chat?documentId=${encodeURIComponent(entity.id)}`,
        prompt,
      });

      const document = await getDocumentById(entity.id);
      if (!document) {
        return { isError: true, content: [{ type: 'text', text: 'Document generation finished, but the document could not be loaded.' }] };
      }

      const html = document.versions?.[document.currentVersion]?.html ?? '';
      const fileUrl = html ? dataUrl('text/html', html) : null;
      const downloadUrl = absoluteUrl(params.baseUrl, `/api/documents/file?documentId=${encodeURIComponent(document.id)}`);

      return createTextResult(`Created document "${document.title}" (id: ${document.id}).`, {
        id: document.id,
        title: document.title,
        fileUrl,
        downloadUrl,
        appUrl: absoluteUrl(params.baseUrl, `/app/documents/${document.id}`),
      });
    }
  );

  server.registerTool(
    'create_video',
    {
      title: 'Create Video',
      description: 'Create a new video composition from a prompt.',
      inputSchema: {
        prompt: z.string().describe('A prompt describing the video to generate'),
        title: z.string().optional().describe('Optional title to use for the new video'),
      },
    },
    async ({ prompt, title }) => {
      const entity = await createEntity(params.userId, title || 'Untitled Video', 'video');
      await runGenerationRequest({
        baseUrl: params.baseUrl,
        token: params.accessToken,
        path: `/api/video-chat?videoId=${encodeURIComponent(entity.id)}`,
        prompt,
      });

      const video = await getVideoById(entity.id);
      if (!video) {
        return { isError: true, content: [{ type: 'text', text: 'Video generation finished, but the video could not be loaded.' }] };
      }

      return createTextResult(`Created video "${video.title}" (id: ${video.id}).`, {
        id: video.id,
        title: video.title,
        status: video.status,
        videoUrl: video.videoUrl ? absoluteUrl(params.baseUrl, video.videoUrl) : null,
        appUrl: absoluteUrl(params.baseUrl, `/app/videos/${video.id}`),
      });
    }
  );

  server.registerTool(
    'list_blog_articles',
    {
      title: 'List Blog Articles',
      description: "List the user's blog articles.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const userIds = await getOrgUserIds(params.organizationId, params.userId);
      const rows = await db
        .select()
        .from(blogArticles)
        .where(inArray(blogArticles.userId, userIds))
        .orderBy(desc(blogArticles.updatedAt));

      const articleList = rows.map((article) => ({
        id: article.id,
        title: article.title,
        tags: article.tags || [],
        wordCount: article.content ? article.content.trim().split(/\s+/).length : 0,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        appUrl: absoluteUrl(params.baseUrl, `/app/blog-articles/${article.id}`),
      }));

      const lines = rows.length
        ? [`Found ${rows.length} blog article${rows.length === 1 ? '' : 's'}:`, ...articleList.map((a) => `- "${a.title}" (id: ${a.id}, words: ${a.wordCount})`)]
        : ['No blog articles found.'];

      return createTextResult(lines.join('\n'), { articles: articleList });
    }
  );

  server.registerTool(
    'download_blog_article',
    {
      title: 'Download Blog Article',
      description: 'Return a blog article content in Markdown format.',
      inputSchema: {
        articleId: z.string().describe('The blog article id to download'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ articleId }) => {
      const article = await getBlogArticleById(articleId);
      if (!article || !await canAccessByOrg(article.userId, params.organizationId, params.userId)) {
        return { isError: true, content: [{ type: 'text', text: 'Blog article not found.' }] };
      }

      if (article.currentVersion < 0 || !article.content) {
        return { isError: true, content: [{ type: 'text', text: 'Blog article has no content yet.' }] };
      }

      const fileUrl = dataUrl('text/markdown', article.content);

      return {
        content: [
          { type: 'text' as const, text: `Downloaded blog article "${article.title}".` },
          {
            type: 'resource' as const,
            resource: {
              uri: absoluteUrl(params.baseUrl, `/app/blog-articles/${article.id}`),
              mimeType: 'text/markdown',
              text: article.content,
            },
          },
        ],
        structuredContent: {
          id: article.id,
          title: article.title,
          content: article.content,
          bannerImage: article.bannerImage,
          tags: article.tags || [],
          mimeType: 'text/markdown',
          fileUrl,
          appUrl: absoluteUrl(params.baseUrl, `/app/blog-articles/${article.id}`),
        },
      };
    }
  );

  server.registerTool(
    'create_blog_article',
    {
      title: 'Create Blog Article',
      description: 'Create a new blog article from a prompt.',
      inputSchema: {
        prompt: z.string().describe('A prompt describing the blog article to write'),
        title: z.string().optional().describe('Optional title for the new article'),
      },
    },
    async ({ prompt, title }) => {
      const entity = await createEntity(params.userId, title || 'Untitled Article', 'blog_article');
      await runGenerationRequest({
        baseUrl: params.baseUrl,
        token: params.accessToken,
        path: `/api/blog-chat?articleId=${encodeURIComponent(entity.id)}`,
        prompt,
      });

      const article = await getBlogArticleById(entity.id);
      if (!article) {
        return { isError: true, content: [{ type: 'text', text: 'Article generation finished, but the article could not be loaded.' }] };
      }

      return createTextResult(`Created blog article "${article.title}" (id: ${article.id}).`, {
        id: article.id,
        title: article.title,
        tags: article.tags || [],
        wordCount: article.content ? article.content.trim().split(/\s+/).length : 0,
        appUrl: absoluteUrl(params.baseUrl, `/app/blog-articles/${article.id}`),
      });
    }
  );

  server.registerTool(
    'list_social_posts',
    {
      title: 'List Social Posts',
      description: "List the user's social media posts.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const userIds = await getOrgUserIds(params.organizationId, params.userId);
      const rows = await db
        .select()
        .from(socialPosts)
        .where(inArray(socialPosts.userId, userIds))
        .orderBy(desc(socialPosts.updatedAt));

      const postList = rows.map((post) => ({
        id: post.id,
        title: post.title,
        platform: post.platform,
        hashtags: post.hashtags || [],
        hasMedia: !!post.mediaUrl,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        appUrl: absoluteUrl(params.baseUrl, `/app/social-posts/${post.id}`),
      }));

      const lines = rows.length
        ? [`Found ${rows.length} social post${rows.length === 1 ? '' : 's'}:`, ...postList.map((p) => `- "${p.title}" (id: ${p.id}, platform: ${p.platform})`)]
        : ['No social posts found.'];

      return createTextResult(lines.join('\n'), { posts: postList });
    }
  );

  server.registerTool(
    'download_social_post',
    {
      title: 'Download Social Post',
      description: 'Return a social media post content as text.',
      inputSchema: {
        postId: z.string().describe('The social post id to download'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ postId }) => {
      const post = await getSocialPostById(postId);
      if (!post || !await canAccessByOrg(post.userId, params.organizationId, params.userId)) {
        return { isError: true, content: [{ type: 'text', text: 'Social post not found.' }] };
      }

      if (post.currentVersion < 0 || !post.content) {
        return { isError: true, content: [{ type: 'text', text: 'Social post has no content yet.' }] };
      }

      const hashtagText = post.hashtags && post.hashtags.length > 0
        ? '\n\n' + post.hashtags.map((h: string) => `#${h}`).join(' ')
        : '';
      const fullText = post.content + hashtagText;

      return {
        content: [
          { type: 'text' as const, text: `Downloaded social post "${post.title}" (${post.platform}).` },
          {
            type: 'resource' as const,
            resource: {
              uri: absoluteUrl(params.baseUrl, `/app/social-posts/${post.id}`),
              mimeType: 'text/plain',
              text: fullText,
            },
          },
        ],
        structuredContent: {
          id: post.id,
          title: post.title,
          platform: post.platform,
          content: post.content,
          hashtags: post.hashtags || [],
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType,
          appUrl: absoluteUrl(params.baseUrl, `/app/social-posts/${post.id}`),
        },
      };
    }
  );

  server.registerTool(
    'create_social_post',
    {
      title: 'Create Social Post',
      description: 'Create a new social media post from a prompt.',
      inputSchema: {
        prompt: z.string().describe('A prompt describing the social media post to write'),
        title: z.string().optional().describe('Optional internal title for the new post'),
        platform: z.enum(['twitter', 'linkedin', 'instagram', 'facebook']).optional().describe('The social media platform to optimize for (default: linkedin)'),
      },
    },
    async ({ prompt, title, platform }) => {
      const entity = await createEntity(params.userId, title || 'Untitled Post', 'social_post');

      // Set platform before generation if provided
      if (platform) {
        const { upsertSocialPost } = await import('@/lib/db/entities-service');
        await upsertSocialPost(entity.id, { platform });
      }

      await runGenerationRequest({
        baseUrl: params.baseUrl,
        token: params.accessToken,
        path: `/api/social-chat?postId=${encodeURIComponent(entity.id)}`,
        prompt,
      });

      const post = await getSocialPostById(entity.id);
      if (!post) {
        return { isError: true, content: [{ type: 'text', text: 'Post generation finished, but the post could not be loaded.' }] };
      }

      return createTextResult(`Created social post "${post.title}" for ${post.platform} (id: ${post.id}).`, {
        id: post.id,
        title: post.title,
        platform: post.platform,
        hashtags: post.hashtags || [],
        appUrl: absoluteUrl(params.baseUrl, `/app/social-posts/${post.id}`),
      });
    }
  );

  return server;
}
