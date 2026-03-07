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
} from './schema';
import { and, count, desc, eq } from 'drizzle-orm';

export type EntityKind = 'document' | 'asset' | 'video';

export async function listEntities(userId: string) {
  const [documentRows, assetRows, videoRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.updatedAt)),
    db.select().from(assets).where(eq(assets.userId, userId)).orderBy(desc(assets.updatedAt)),
    db.select().from(videos).where(eq(videos.userId, userId)).orderBy(desc(videos.updatedAt)),
  ]);

  const documentsWithStats = await Promise.all(documentRows.map(async (document) => {
    const [{ value: versionCount }] = await db
      .select({ value: count() })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, document.id));

    const currentVersionRows = await db
      .select({ html: documentVersions.html })
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
      userId: document.userId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      thumbnail: document.thumbnail,
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

    return {
      id: asset.id,
      name: asset.title,
      type: 'asset' as const,
      userId: asset.userId,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      svgContent: asset.svgContent,
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

    return {
      id: video.id,
      name: video.title,
      type: 'video' as const,
      userId: video.userId,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      videoUrl: video.videoUrl,
      videoStatus: video.status,
      currentVersion: video.currentVersion,
      versionCount: Number(versionCount),
      pageCount: 0,
    };
  }));

  return [...documentsWithStats, ...assetsWithStats, ...videosWithStats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function createEntity(userId: string, name: string, type: EntityKind) {
  if (type === 'asset') {
    const [asset] = await db
      .insert(assets)
      .values({ userId, title: name, currentVersion: -1 })
      .returning();
    return { id: asset.id, name: asset.title, type };
  }

  if (type === 'video') {
    const [video] = await db
      .insert(videos)
      .values({ userId, title: name, currentVersion: -1 })
      .returning();
    return { id: video.id, name: video.title, type };
  }

  const [document] = await db
    .insert(documents)
    .values({ userId, title: name, width: 800, height: 600, currentVersion: -1 })
    .returning();
  return { id: document.id, name: document.title, type };
}

export async function deleteEntity(id: string, userId: string) {
  const deletedDocument = await db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId))).returning({ id: documents.id });
  if (deletedDocument.length > 0) return;

  const deletedAsset = await db.delete(assets).where(and(eq(assets.id, id), eq(assets.userId, userId))).returning({ id: assets.id });
  if (deletedAsset.length > 0) return;

  await db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, userId)));
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
    versions: versions.map((v) => ({ html: v.html, timestamp: v.createdAt.getTime(), googleFonts: v.googleFonts || [] })),
  };
}

export async function createOrUpdateDocument(documentId: string, title: string, width: number, height: number, html: string, googleFonts: string[] = []) {
  let [documentData] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!documentData) throw new Error('Document not found');

  if (documentData.title !== title || documentData.width !== width || documentData.height !== height) {
    [documentData] = await db.update(documents).set({ title, width, height, updatedAt: new Date() }).where(eq(documents.id, documentData.id)).returning();
  }

  const existingVersions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, documentData.id));
  const newVersionNumber = existingVersions.length;

  await db.insert(documentVersions).values({ documentId: documentData.id, version: newVersionNumber, html, googleFonts: googleFonts.length > 0 ? googleFonts : null });

  [documentData] = await db.update(documents).set({ currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(documents.id, documentData.id)).returning();

  return { ...documentData, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1 };
}

export async function updateDocumentSettings(documentId: string, title: string, width: number, height: number) {
  const [updated] = await db.update(documents).set({ title, width, height, updatedAt: new Date() }).where(eq(documents.id, documentId)).returning();
  return updated ?? null;
}

export async function getDocumentMessages(documentId: string) {
  return await db.select().from(documentChatMessages).where(eq(documentChatMessages.documentId, documentId)).orderBy(documentChatMessages.createdAt);
}

export async function saveDocumentMessage(documentId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(documentChatMessages).values({ documentId, role, content });
}

export async function getAssetById(assetId: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) return null;

  const versions = await db.select().from(assetVersions).where(eq(assetVersions.assetId, asset.id)).orderBy(assetVersions.version);
  return {
    ...asset,
    versions: versions.map((v) => ({ svgContent: v.svgContent, title: v.title, width: v.width, height: v.height, timestamp: v.createdAt.getTime() })),
  };
}

export async function upsertAsset(assetId: string, data: { svgContent?: string; title?: string; width?: number; height?: number; createVersion?: boolean }) {
  let [existing] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!existing) throw new Error('Asset not found');

  const existingVersions = await db.select().from(assetVersions).where(eq(assetVersions.assetId, existing.id));
  const nextTitle = data.title ?? existing.title;
  const nextWidth = data.width ?? existing.width;
  const nextHeight = data.height ?? existing.height;
  const nextSvgContent = data.svgContent ?? existing.svgContent;
  const shouldCreateVersion = data.createVersion ?? (data.svgContent !== undefined);

  if (shouldCreateVersion) {
    const newVersionNumber = existingVersions.length;
    await db.insert(assetVersions).values({ assetId: existing.id, version: newVersionNumber, svgContent: nextSvgContent, title: nextTitle, width: nextWidth, height: nextHeight });
    const [updated] = await db.update(assets).set({ svgContent: nextSvgContent, title: nextTitle, width: nextWidth, height: nextHeight, currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(assets.id, existing.id)).returning();
    return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1 };
  }

  const [updated] = await db.update(assets).set({ title: nextTitle, width: nextWidth, height: nextHeight, updatedAt: new Date() }).where(eq(assets.id, existing.id)).returning();
  return updated;
}

export async function getAssetMessages(assetId: string) {
  return await db.select().from(assetChatMessages).where(eq(assetChatMessages.assetId, assetId)).orderBy(assetChatMessages.createdAt);
}

export async function saveAssetMessage(assetId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(assetChatMessages).values({ assetId, role, content });
}

export async function getVideoById(videoId: string) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;

  const versions = await db.select().from(videoVersions).where(eq(videoVersions.videoId, video.id)).orderBy(videoVersions.version);
  return {
    ...video,
    versions: versions.map((v) => ({ title: v.title, remotionCode: v.remotionCode, width: v.width, height: v.height, durationInFrames: v.durationInFrames, fps: v.fps, timestamp: v.createdAt.getTime() })),
  };
}

export async function upsertVideo(videoId: string, data: { remotionCode?: string; title?: string; width?: number; height?: number; durationInFrames?: number; fps?: number; videoUrl?: string; status?: string; createVersion?: boolean }) {
  let [existing] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!existing) throw new Error('Video not found');

  const shouldCreateVersion = data.createVersion ?? Boolean(data.remotionCode !== undefined || data.title !== undefined || data.width !== undefined || data.height !== undefined || data.durationInFrames !== undefined || data.fps !== undefined);

  if (!shouldCreateVersion) {
    const updateData = { ...data };
    delete updateData.createVersion;
    const [updated] = await db.update(videos).set({ ...updateData, updatedAt: new Date() }).where(eq(videos.id, existing.id)).returning();
    return updated;
  }

  const nextData = {
    remotionCode: data.remotionCode ?? existing.remotionCode,
    title: data.title ?? existing.title,
    width: data.width ?? existing.width,
    height: data.height ?? existing.height,
    durationInFrames: data.durationInFrames ?? existing.durationInFrames,
    fps: data.fps ?? existing.fps,
  };

  const existingVersions = await db.select().from(videoVersions).where(eq(videoVersions.videoId, existing.id));
  const newVersionNumber = existingVersions.length;
  await db.insert(videoVersions).values({ videoId: existing.id, version: newVersionNumber, title: nextData.title, remotionCode: nextData.remotionCode, width: nextData.width, height: nextData.height, durationInFrames: nextData.durationInFrames, fps: nextData.fps });

  const [updated] = await db.update(videos).set({ ...nextData, ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}), ...(data.status !== undefined ? { status: data.status } : {}), currentVersion: newVersionNumber, updatedAt: new Date() }).where(eq(videos.id, existing.id)).returning();
  return { ...updated, currentVersion: newVersionNumber, totalVersions: existingVersions.length + 1 };
}

export async function getVideoMessages(videoId: string) {
  return await db.select().from(videoChatMessages).where(eq(videoChatMessages.videoId, videoId)).orderBy(videoChatMessages.createdAt);
}

export async function saveVideoMessage(videoId: string, role: 'user' | 'assistant', content: any) {
  await db.insert(videoChatMessages).values({ videoId, role, content });
}
