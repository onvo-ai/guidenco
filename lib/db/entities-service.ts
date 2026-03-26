import { db } from './index';
import {
  documents,
  documentVersions,
  documentChatMessages,
  assets,
  assetVersions,
  assetChatMessages,
  videos,
  videoVersions,
  videoChatMessages,
  blogArticles,
  blogArticleVersions,
  blogArticleChatMessages,
  socialPosts,
  socialPostVersions,
  socialPostChatMessages,
  experiments,
  experimentParameters,
} from './schema';
import { and, count, desc, eq } from 'drizzle-orm';

export type EntityKind = 'document' | 'asset' | 'video' | 'blog_article' | 'social_post';

export async function listEntities(organizationId: string) {
  const [documentRows, assetRows, videoRows, articleRows, socialPostRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.organizationId, organizationId)).orderBy(desc(documents.updatedAt)),
    db.select().from(assets).where(eq(assets.organizationId, organizationId)).orderBy(desc(assets.updatedAt)),
    db.select().from(videos).where(eq(videos.organizationId, organizationId)).orderBy(desc(videos.updatedAt)),
    db.select().from(blogArticles).where(eq(blogArticles.organizationId, organizationId)).orderBy(desc(blogArticles.updatedAt)),
    db.select().from(socialPosts).where(eq(socialPosts.organizationId, organizationId)).orderBy(desc(socialPosts.updatedAt)),
  ]);

  const documentsWithStats = await Promise.all(documentRows.map(async (document) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, document.id));

    const currentVersionRows = await db
      .select({ html: documentVersions.html, thumbnail: documentVersions.thumbnail, width: documentVersions.width, height: documentVersions.height })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, document.id))
      .orderBy(desc(documentVersions.version))
      .limit(1);

    const html = currentVersionRows[0]?.html ?? '';
    const normalized = html
      .split('\n<!-- GUIDENCO_PAGE_BREAK -->\n').join('\n<!-- PAGE_BREAK -->\n')
      .split('\n<!-- ARTISTE_PAGE_BREAK -->\n').join('\n<!-- PAGE_BREAK -->\n');
    const pageCount = html ? normalized.split('\n<!-- PAGE_BREAK -->\n').length : 0;

    return {
      id: document.id,
      name: document.title,
      type: 'document' as const,
      organizationId: document.organizationId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      thumbnail: currentVersionRows[0]?.thumbnail,
      width: currentVersionRows[0]?.width ?? 800,
      height: currentVersionRows[0]?.height ?? 600,
      currentVersion: document.currentVersion,
      versionCount: Number(versionCount),
      pageCount,
    };
  }));

  const assetsWithStats = await Promise.all(assetRows.map(async (asset) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(assetVersions)
      .where(eq(assetVersions.assetId, asset.id));

    const currentVersionRows = await db
      .select({ svgContent: assetVersions.svgContent, width: assetVersions.width, height: assetVersions.height })
      .from(assetVersions)
      .where(eq(assetVersions.assetId, asset.id))
      .orderBy(desc(assetVersions.version))
      .limit(1);

    return {
      id: asset.id,
      name: asset.title,
      type: 'asset' as const,
      organizationId: asset.organizationId,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      svgContent: currentVersionRows[0]?.svgContent ?? '',
      width: currentVersionRows[0]?.width ?? 1024,
      height: currentVersionRows[0]?.height ?? 1024,
      currentVersion: asset.currentVersion,
      versionCount: Number(versionCount),
      pageCount: 0,
    };
  }));

  const videosWithStats = await Promise.all(videoRows.map(async (video) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(videoVersions)
      .where(eq(videoVersions.videoId, video.id));

    const currentVersionRows = await db
      .select({ videoUrl: videoVersions.videoUrl, status: videoVersions.status, width: videoVersions.width, height: videoVersions.height })
      .from(videoVersions)
      .where(eq(videoVersions.videoId, video.id))
      .orderBy(desc(videoVersions.version))
      .limit(1);

    return {
      id: video.id,
      name: video.title,
      type: 'video' as const,
      organizationId: video.organizationId,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      videoUrl: currentVersionRows[0]?.videoUrl,
      videoStatus: currentVersionRows[0]?.status ?? 'pending',
      width: currentVersionRows[0]?.width ?? 1920,
      height: currentVersionRows[0]?.height ?? 1080,
      currentVersion: video.currentVersion,
      versionCount: Number(versionCount),
      pageCount: 0,
    };
  }));

  const articlesWithStats = await Promise.all(articleRows.map(async (article) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(blogArticleVersions)
      .where(eq(blogArticleVersions.articleId, article.id));

    const currentVersionRows = await db
      .select({ content: blogArticleVersions.content, bannerImage: blogArticleVersions.bannerImage, tags: blogArticleVersions.tags })
      .from(blogArticleVersions)
      .where(eq(blogArticleVersions.articleId, article.id))
      .orderBy(desc(blogArticleVersions.version))
      .limit(1);

    return {
      id: article.id,
      name: article.title,
      type: 'blog_article' as const,
      organizationId: article.organizationId,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      content: currentVersionRows[0]?.content ?? '',
      bannerImage: currentVersionRows[0]?.bannerImage,
      tags: currentVersionRows[0]?.tags || [],
      currentVersion: article.currentVersion,
      versionCount: Number(versionCount),
      pageCount: 0,
    };
  }));

  const socialPostsWithStats = await Promise.all(socialPostRows.map(async (post) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(socialPostVersions)
      .where(eq(socialPostVersions.postId, post.id));

    const currentVersionRows = await db
      .select({ content: socialPostVersions.content, hashtags: socialPostVersions.hashtags, mediaUrl: socialPostVersions.mediaUrl, mediaType: socialPostVersions.mediaType })
      .from(socialPostVersions)
      .where(eq(socialPostVersions.postId, post.id))
      .orderBy(desc(socialPostVersions.version))
      .limit(1);

    return {
      id: post.id,
      name: post.title,
      type: 'social_post' as const,
      organizationId: post.organizationId,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      content: currentVersionRows[0]?.content ?? '',
      hashtags: currentVersionRows[0]?.hashtags || [],
      mediaUrl: currentVersionRows[0]?.mediaUrl,
      mediaType: currentVersionRows[0]?.mediaType,
      currentVersion: post.currentVersion,
      versionCount: Number(versionCount),
      pageCount: 0,
    };
  }));

  return [...documentsWithStats, ...assetsWithStats, ...videosWithStats, ...articlesWithStats, ...socialPostsWithStats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function createEntity(organizationId: string, name: string, type: EntityKind) {
  if (type === 'asset') {
    const [asset] = await db
      .insert(assets)
      .values({ organizationId, title: name, currentVersion: -1 })
      .returning();
    return { id: asset.id, name: asset.title, type };
  }

  if (type === 'video') {
    const [video] = await db
      .insert(videos)
      .values({ organizationId, title: name, currentVersion: -1 })
      .returning();
    return { id: video.id, name: video.title, type };
  }

  if (type === 'blog_article') {
    const [article] = await db
      .insert(blogArticles)
      .values({ organizationId, title: name, currentVersion: -1 })
      .returning();
    return { id: article.id, name: article.title, type };
  }

  if (type === 'social_post') {
    const [post] = await db
      .insert(socialPosts)
      .values({ organizationId, title: name, currentVersion: -1 })
      .returning();
    return { id: post.id, name: post.title, type };
  }

  const [document] = await db
    .insert(documents)
    .values({ organizationId, title: name, currentVersion: -1 })
    .returning();
  return { id: document.id, name: document.title, type };
}

export async function deleteEntity(id: string, organizationId: string) {
  const deletedDocument = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.organizationId, organizationId))).returning({ id: documents.id });
  if (deletedDocument.length > 0) return;

  const deletedAsset = await db.delete(assets).where(and(eq(assets.id, id), eq(assets.organizationId, organizationId))).returning({ id: assets.id });
  if (deletedAsset.length > 0) return;

  const deletedVideo = await db.delete(videos).where(and(eq(videos.id, id), eq(videos.organizationId, organizationId))).returning({ id: videos.id });
  if (deletedVideo.length > 0) return;

  const deletedArticle = await db.delete(blogArticles).where(and(eq(blogArticles.id, id), eq(blogArticles.organizationId, organizationId))).returning({ id: blogArticles.id });
  if (deletedArticle.length > 0) return;

  await db.delete(socialPosts).where(and(eq(socialPosts.id, id), eq(socialPosts.organizationId, organizationId)));
}

export async function getDocumentById(documentId: string) {
  const [documentData] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!documentData) return null;

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentData.id))
    .orderBy(documentVersions.version);

  return {
    ...documentData,
    versions: versions
      .filter((v) => v.status !== 'error')
      .map((v) => ({ id: v.id, html: v.html, timestamp: v.createdAt.getTime(), googleFonts: v.googleFonts || [], prompt: v.prompt ?? undefined, parentVersionId: v.parentVersionId ?? undefined, model: v.model ?? undefined, width: v.width, height: v.height, thumbnail: v.thumbnail, url: v.url, status: v.status })),
  };
}

export async function createOrUpdateDocument(documentId: string, title: string, width: number, height: number, html: string, googleFonts: string[] = [], prompt?: string, parentVersionId?: string, model?: string) {
  let [documentData] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!documentData) throw new Error('Document not found');

  if (documentData.title !== title) {
    [documentData] = await db.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, documentData.id)).returning();
  }

  const existingVersions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, documentData.id));
  const newVersionNumber = existingVersions.length;

  const [newVersion] = await db.insert(documentVersions).values({ documentId: documentData.id, version: newVersionNumber, html, width, height, googleFonts: googleFonts.length > 0 ? googleFonts : null, prompt: prompt ?? null, parentVersionId: parentVersionId ?? null, model: model ?? null }).returning();

  [documentData] = await db.update(documents).set({ currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(documents.id, documentData.id)).returning();

  return { ...documentData, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1, newVersionId: newVersion.id };
}

export async function updateDocumentSettings(documentId: string, title: string) {
  const [updated] = await db.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, documentId)).returning();
  return updated ?? null;
}

export async function getDocumentMessages(documentVersionId: string) {
  return await db.select().from(documentChatMessages).where(eq(documentChatMessages.documentVersionId, documentVersionId)).orderBy(documentChatMessages.createdAt);
}

export async function saveDocumentMessage(documentVersionId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(documentChatMessages).values({ documentVersionId, role, content });
}

export async function createPendingDocumentVersion(documentId: string, opts: { prompt?: string; parentVersionId?: string; model?: string } = {}) {
  let [documentData] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!documentData) throw new Error('Document not found');

  const existingVersions = await db.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.documentId, documentData.id));
  const newVersionNumber = existingVersions.length;

  const [newVersion] = await db.insert(documentVersions).values({
    documentId: documentData.id,
    version: newVersionNumber,
    html: '',
    width: 800,
    height: 600,
    status: 'generating',
    prompt: opts.prompt ?? null,
    parentVersionId: opts.parentVersionId ?? null,
    model: opts.model ?? null,
  }).returning();

  await db.update(documents).set({ currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(documents.id, documentData.id));

  return { versionId: newVersion.id, versionNumber: newVersionNumber };
}

export async function updateDocumentVersionContent(versionId: string, data: { html: string; width: number; height: number; googleFonts?: string[]; title?: string; status?: string }) {
  const [version] = await db.select({ documentId: documentVersions.documentId }).from(documentVersions).where(eq(documentVersions.id, versionId));
  if (!version) throw new Error('Version not found');

  await db.update(documentVersions).set({
    html: data.html,
    width: data.width,
    height: data.height,
    googleFonts: data.googleFonts && data.googleFonts.length > 0 ? data.googleFonts : null,
    status: data.status ?? 'done',
  }).where(eq(documentVersions.id, versionId));

  const docUpdate: Record<string, any> = { updatedAt: new Date() };
  if (data.title) docUpdate.title = data.title;
  await db.update(documents).set(docUpdate).where(eq(documents.id, version.documentId));
}

export async function updateDocumentVersionStatus(versionId: string, status: 'generating' | 'done' | 'error') {
  await db.update(documentVersions).set({ status }).where(eq(documentVersions.id, versionId));
}

export async function getAssetById(assetId: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) return null;

  const versions = await db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(assetVersions.version);
  return {
    ...asset,
    versions: versions.map((v) => ({ id: v.id, svgContent: v.svgContent, title: v.title, width: v.width, height: v.height, timestamp: v.createdAt.getTime(), prompt: v.prompt ?? undefined, parentVersionId: v.parentVersionId ?? undefined, model: v.model ?? undefined, tokenCount: v.tokenCount ?? undefined, creditCount: v.creditCount ?? undefined })),
  };
}

export async function getAssetVersionById(versionId: string) {
  const [version] = await db.select().from(assetVersions).where(eq(assetVersions.id, versionId)).limit(1);
  return version ?? null;
}

export async function updateAssetVersionUsage(versionId: string, tokenCount: number, creditCount: number) {
  await db.update(assetVersions).set({ tokenCount, creditCount }).where(eq(assetVersions.id, versionId));
}

export async function upsertAsset(assetId: string, data: { svgContent?: string; title?: string; width?: number; height?: number; createVersion?: boolean; prompt?: string; parentVersionId?: string; model?: string; tokenCount?: number; creditCount?: number }) {
  let [existing] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!existing) throw new Error('Asset not found');

  const existingVersions = await db.select().from(assetVersions).where(eq(assetVersions.assetId, existing.id));
  const nextTitle = data.title ?? existing.title;
  const nextWidth = data.width ?? 1024;
  const nextHeight = data.height ?? 1024;
  const nextSvgContent = data.svgContent ?? '';
  const shouldCreateVersion = data.createVersion ?? (data.svgContent !== undefined);

  if (shouldCreateVersion) {
    const newVersionNumber = existingVersions.length;
    const [newVersion] = await db.insert(assetVersions).values({ assetId: existing.id, version: newVersionNumber, svgContent: nextSvgContent, title: nextTitle, width: nextWidth, height: nextHeight, prompt: data.prompt, parentVersionId: data.parentVersionId, model: data.model, tokenCount: data.tokenCount, creditCount: data.creditCount }).returning();
    const [updated] = await db.update(assets).set({ title: nextTitle, currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(assets.id, existing.id)).returning();
    return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1, newVersionId: newVersion.id };
  }

  const [updated] = await db.update(assets).set({ title: nextTitle, updatedAt: new Date() }).where(eq(assets.id, existing.id)).returning();
  return updated;
}

export async function getAssetMessages(assetId: string) {
  return await db.select().from(assetChatMessages).where(eq(assetChatMessages.assetId, assetId)).orderBy(assetChatMessages.createdAt);
}

export async function saveAssetMessage(assetId: string, role: 'user' | 'assistant', content: any, model?: string) {
  await db.insert(assetChatMessages).values({ assetId, role, content, ...(model ? { model } : {}) });
}

export async function getVideoById(videoId: string) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;

  const versions = await db.select().from(videoVersions).where(eq(videoVersions.videoId, video.id)).orderBy(videoVersions.version);
  return {
    ...video,
    versions: versions.map((v) => ({ id: v.id, title: v.title, remotionCode: v.remotionCode, width: v.width, height: v.height, durationInFrames: v.durationInFrames, fps: v.fps, timestamp: v.createdAt.getTime(), prompt: v.prompt ?? undefined, parentVersionId: v.parentVersionId ?? undefined, model: v.model ?? undefined, videoUrl: v.videoUrl ?? undefined, status: v.status, url: v.url })),
  };
}

export async function updateVideoVersion(versionId: string, data: { videoUrl?: string; status?: string }) {
  const update: Record<string, any> = {};
  if (data.videoUrl !== undefined) update.videoUrl = data.videoUrl;
  if (data.status !== undefined) update.status = data.status;
  if (Object.keys(update).length === 0) return;
  await db.update(videoVersions).set(update).where(eq(videoVersions.id, versionId));
}

export async function getVideoVersionById(versionId: string) {
  const [version] = await db.select().from(videoVersions).where(eq(videoVersions.id, versionId)).limit(1);
  return version ?? null;
}

export async function upsertVideo(videoId: string, data: { remotionCode?: string; title?: string; width?: number; height?: number; durationInFrames?: number; fps?: number; videoUrl?: string; status?: string; createVersion?: boolean; prompt?: string; parentVersionId?: string; model?: string }) {
  let [existing] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!existing) throw new Error('Video not found');

  const shouldCreateVersion = data.createVersion ?? Boolean(data.remotionCode !== undefined || data.title !== undefined || data.width !== undefined || data.height !== undefined || data.durationInFrames !== undefined || data.fps !== undefined);

  if (!shouldCreateVersion) {
    const updateData: any = { ...data };
    delete updateData.createVersion;
    delete updateData.prompt;
    delete updateData.parentVersionId;
    const [updated] = await db.update(videos).set({ ...updateData, updatedAt: new Date() }).where(eq(videos.id, existing.id)).returning();
    return updated;
  }

  const nextData = {
    remotionCode: data.remotionCode ?? existing.remotionCode,
    title: data.title ?? existing.title,
    width: data.width ?? 1920,
    height: data.height ?? 1080,
    durationInFrames: data.durationInFrames ?? 150,
    fps: data.fps ?? 30,
  };

  const existingVersions = await db.select().from(videoVersions).where(eq(videoVersions.videoId, existing.id));
  const newVersionNumber = existingVersions.length;
  const [newVersion] = await db.insert(videoVersions).values({ videoId: existing.id, version: newVersionNumber, title: nextData.title, remotionCode: nextData.remotionCode, width: nextData.width, height: nextData.height, durationInFrames: nextData.durationInFrames, fps: nextData.fps, prompt: data.prompt, parentVersionId: data.parentVersionId, model: data.model, ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}), ...(data.status !== undefined ? { status: data.status } : {}) }).returning();

  const [updated] = await db.update(videos).set({ title: nextData.title, currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(videos.id, existing.id)).returning();
  return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1, newVersionId: newVersion.id };
}

export async function getVideoMessages(videoVersionId: string) {
  return await db.select().from(videoChatMessages).where(eq(videoChatMessages.videoVersionId, videoVersionId)).orderBy(videoChatMessages.createdAt);
}

export async function saveVideoMessage(videoVersionId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(videoChatMessages).values({ videoVersionId, role, content });
}

export async function getBlogArticleById(articleId: string) {
  const [article] = await db.select().from(blogArticles).where(eq(blogArticles.id, articleId)).limit(1);
  if (!article) return null;

  const versions = await db.select().from(blogArticleVersions).where(eq(blogArticleVersions.articleId, article.id)).orderBy(blogArticleVersions.version);
  return {
    ...article,
    versions: versions.map((v) => ({ id: v.id, title: v.title, content: v.content, bannerImage: v.bannerImage, tags: v.tags || [], timestamp: v.createdAt.getTime(), prompt: v.prompt ?? undefined, parentVersionId: v.parentVersionId ?? undefined, url: v.url })),
  };
}

export async function getBlogArticleVersionById(versionId: string) {
  const [version] = await db.select().from(blogArticleVersions).where(eq(blogArticleVersions.id, versionId)).limit(1);
  return version ?? null;
}

export async function upsertBlogArticle(articleId: string, data: { content?: string; title?: string; bannerImage?: string | null; tags?: string[]; createVersion?: boolean; prompt?: string; parentVersionId?: string }) {
  let [existing] = await db.select().from(blogArticles).where(eq(blogArticles.id, articleId)).limit(1);
  if (!existing) throw new Error('Blog article not found');

  const nextTitle = data.title ?? existing.title;
  const nextContent = data.content ?? '';
  const nextBannerImage = data.bannerImage ?? null;
  const nextTags = data.tags !== undefined ? data.tags : [];
  const shouldCreateVersion = data.createVersion ?? (data.content !== undefined);

  if (shouldCreateVersion) {
    const existingVersions = await db.select().from(blogArticleVersions).where(eq(blogArticleVersions.articleId, existing.id));
    const newVersionNumber = existingVersions.length;
    const [newVersion] = await db.insert(blogArticleVersions).values({ articleId: existing.id, version: newVersionNumber, title: nextTitle, content: nextContent, bannerImage: nextBannerImage, tags: nextTags.length > 0 ? nextTags : null, prompt: data.prompt, parentVersionId: data.parentVersionId }).returning();
    const [updated] = await db.update(blogArticles).set({ title: nextTitle, currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(blogArticles.id, existing.id)).returning();
    return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1, newVersionId: newVersion.id };
  }

  const updateData: any = { title: nextTitle, updatedAt: new Date() };
  const [updated] = await db.update(blogArticles).set(updateData).where(eq(blogArticles.id, existing.id)).returning();
  return updated;
}

export async function getBlogArticleMessages(articleVersionId: string) {
  return await db.select().from(blogArticleChatMessages).where(eq(blogArticleChatMessages.articleVersionId, articleVersionId)).orderBy(blogArticleChatMessages.createdAt);
}

export async function saveBlogArticleMessage(articleVersionId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(blogArticleChatMessages).values({ articleVersionId, role, content });
}

export async function getSocialPostById(postId: string) {
  const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!post) return null;

  const versions = await db.select().from(socialPostVersions).where(eq(socialPostVersions.postId, post.id)).orderBy(socialPostVersions.version);
  return {
    ...post,
    versions: versions.map((v) => ({ id: v.id, title: v.title, content: v.content, hashtags: v.hashtags || [], mediaUrl: v.mediaUrl, mediaType: v.mediaType, timestamp: v.createdAt.getTime(), prompt: v.prompt ?? undefined, parentVersionId: v.parentVersionId ?? undefined, url: v.url })),
  };
}

export async function getSocialPostVersionById(versionId: string) {
  const [version] = await db.select().from(socialPostVersions).where(eq(socialPostVersions.id, versionId)).limit(1);
  return version ?? null;
}

export async function upsertSocialPost(postId: string, data: { content?: string; title?: string; hashtags?: string[]; mediaUrl?: string | null; mediaType?: string | null; createVersion?: boolean; prompt?: string; parentVersionId?: string }) {
  let [existing] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!existing) throw new Error('Social post not found');

  const nextTitle = data.title ?? existing.title;
  const nextContent = data.content ?? '';
  const nextHashtags = data.hashtags !== undefined ? data.hashtags : [];
  const nextMediaUrl = data.mediaUrl !== undefined ? data.mediaUrl : null;
  const nextMediaType = data.mediaType !== undefined ? data.mediaType : null;
  const shouldCreateVersion = data.createVersion ?? (data.content !== undefined);

  if (shouldCreateVersion) {
    const existingVersions = await db.select().from(socialPostVersions).where(eq(socialPostVersions.postId, existing.id));
    const newVersionNumber = existingVersions.length;
    const [newVersion] = await db.insert(socialPostVersions).values({ postId: existing.id, version: newVersionNumber, title: nextTitle, content: nextContent, hashtags: nextHashtags.length > 0 ? nextHashtags : null, mediaUrl: nextMediaUrl, mediaType: nextMediaType, prompt: data.prompt, parentVersionId: data.parentVersionId }).returning();
    const [updated] = await db.update(socialPosts).set({ title: nextTitle, currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(socialPosts.id, existing.id)).returning();
    return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1, newVersionId: newVersion.id };
  }

  const updateData: any = { title: nextTitle, updatedAt: new Date() };
  const [updated] = await db.update(socialPosts).set(updateData).where(eq(socialPosts.id, existing.id)).returning();
  return updated;
}

export async function getSocialPostMessages(postVersionId: string) {
  return await db.select().from(socialPostChatMessages).where(eq(socialPostChatMessages.postVersionId, postVersionId)).orderBy(socialPostChatMessages.createdAt);
}

export async function saveSocialPostMessage(postVersionId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(socialPostChatMessages).values({ postVersionId, role, content });
}

// Experiments
export async function createExperiment(entityId: string, entityType: EntityKind, data: { maxDepth?: number; maxIterations?: number; timeLimit?: Date; parameters?: Array<{ key: string; description?: string; type: 'string' | 'number' | 'boolean'; stringValue?: string; numberValue?: number; numberMin?: number; numberMax?: number; booleanValue?: boolean }> }) {
  const [experiment] = await db.insert(experiments).values({
    entityId,
    entityType,
    maxDepth: data.maxDepth ?? 3,
    maxIterations: data.maxIterations ?? 5,
    timeLimit: data.timeLimit ?? null,
  }).returning();

  if (data.parameters && data.parameters.length > 0) {
    await db.insert(experimentParameters).values(
      data.parameters.map(p => ({
        experimentId: experiment.id,
        key: p.key,
        description: p.description ?? null,
        type: p.type,
        stringValue: p.type === 'string' ? p.stringValue ?? null : null,
        numberValue: p.type === 'number' ? p.numberValue ?? null : null,
        numberMin: p.type === 'number' ? p.numberMin ?? null : null,
        numberMax: p.type === 'number' ? p.numberMax ?? null : null,
        booleanValue: p.type === 'boolean' ? p.booleanValue ?? null : null,
      }))
    );
  }

  return experiment;
}

export async function getExperimentById(experimentId: string) {
  const [experiment] = await db.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1);
  if (!experiment) return null;

  const parameters = await db.select().from(experimentParameters).where(eq(experimentParameters.experimentId, experiment.id));

  return {
    ...experiment,
    parameters: parameters.map(p => ({
      id: p.id,
      key: p.key,
      description: p.description,
      type: p.type,
      value: p.type === 'string' ? p.stringValue : p.type === 'number' ? p.numberValue : p.booleanValue,
      min: p.numberMin,
      max: p.numberMax,
    })),
  };
}

export async function getExperimentsForEntity(entityId: string) {
  return await db.select().from(experiments).where(eq(experiments.entityId, entityId)).orderBy(desc(experiments.createdAt));
}

export async function updateExperimentStatus(experimentId: string, status: 'active' | 'completed' | 'cancelled') {
  const [updated] = await db.update(experiments).set({ status, updatedAt: new Date() }).where(eq(experiments.id, experimentId)).returning();
  return updated ?? null;
}

export async function deleteExperiment(experimentId: string) {
  await db.delete(experiments).where(eq(experiments.id, experimentId));
}
