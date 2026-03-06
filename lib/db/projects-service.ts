import { db } from './index';
import { projects, artworks, artworkVersions, chatMessages, projectAssets, projectVideos, assetChatMessages, videoChatMessages } from './schema';
import { eq, and, desc } from 'drizzle-orm';

export async function getUserProjects(userId: string) {
  return await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt));
}

export async function createProject(userId: string, name: string) {
  const [newProject] = await db
    .insert(projects)
    .values({ userId, name })
    .returning();
  return newProject;
}

export async function deleteProject(projectId: string, userId: string) {
  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
}

export async function getProjectArtwork(projectId: string) {
  const [artworkData] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.projectId, projectId));

  if (!artworkData) return null;

  const versions = await db
    .select()
    .from(artworkVersions)
    .where(eq(artworkVersions.artworkId, artworkData.id))
    .orderBy(artworkVersions.version);

  return {
    ...artworkData,
    versions: versions.map(v => ({
      html: v.html,
      timestamp: v.createdAt.getTime(),
      googleFonts: v.googleFonts || []
    })),
  };
}

export async function createOrUpdateArtwork(
  projectId: string,
  width: number,
  height: number,
  html: string,
  googleFonts: string[] = []
) {
  // Check if artwork exists
  let [artworkData] = await db
    .select()
    .from(artworks)
    .where(eq(artworks.projectId, projectId));

  if (!artworkData) {
    // Create new artwork
    [artworkData] = await db
      .insert(artworks)
      .values({ projectId, width, height, currentVersion: 0 })
      .returning();
  } else {
    // Update dimensions if changed
    if (artworkData.width !== width || artworkData.height !== height) {
      [artworkData] = await db
        .update(artworks)
        .set({ width, height, updatedAt: new Date() })
        .where(eq(artworks.id, artworkData.id))
        .returning();
    }
  }

  // Get current version count from artwork_versions table
  const existingVersions = await db
    .select()
    .from(artworkVersions)
    .where(eq(artworkVersions.artworkId, artworkData.id));

  const newVersionNumber = existingVersions.length;

  // Store new version in artwork_versions table
  await db.insert(artworkVersions).values({
    artworkId: artworkData.id,
    version: newVersionNumber,
    html,
    googleFonts: googleFonts.length > 0 ? googleFonts : null,
  });

  // Update current version pointer
  [artworkData] = await db
    .update(artworks)
    .set({
      currentVersion: newVersionNumber,
      updatedAt: new Date(),
    })
    .where(eq(artworks.id, artworkData.id))
    .returning();

  // Generate thumbnail asynchronously (don't wait for it)
  (async () => {
    try {
      const renderResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: html,
          width,
          height,
          format: 'base64',
          googleFonts,
        }),
      });

      if (renderResponse.ok) {
        const renderData = await renderResponse.json();
        // Update thumbnail separately
        await db
          .update(artworks)
          .set({ thumbnail: renderData.image })
          .where(eq(artworks.id, artworkData.id));
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
    }
  })();

  return {
    ...artworkData,
    currentVersion: newVersionNumber,
    totalVersions: existingVersions.length + 1, // +1 because we just added one
  };
}

export async function getProjectMessages(projectId: string) {
  return await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(chatMessages.createdAt);
}

export async function saveMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: any
) {
  await db.insert(chatMessages).values({
    projectId,
    role,
    content,
  });
}

// ── Project Assets (SVG) ──────────────────────────────────────────────────────

export async function getProjectAsset(projectId: string) {
  const [asset] = await db
    .select()
    .from(projectAssets)
    .where(eq(projectAssets.projectId, projectId))
    .orderBy(desc(projectAssets.updatedAt))
    .limit(1);
  return asset ?? null;
}

export async function upsertProjectAsset(
  projectId: string,
  svgContent: string,
  title?: string
) {
  const [existing] = await db
    .select()
    .from(projectAssets)
    .where(eq(projectAssets.projectId, projectId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(projectAssets)
      .set({
        svgContent,
        ...(title ? { title } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectAssets.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(projectAssets)
      .values({ projectId, svgContent, title: title ?? 'Untitled Asset' })
      .returning();
    return created;
  }
}

export async function getAssetMessages(projectId: string) {
  return await db
    .select()
    .from(assetChatMessages)
    .where(eq(assetChatMessages.projectId, projectId))
    .orderBy(assetChatMessages.createdAt);
}

export async function saveAssetMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: any
) {
  await db.insert(assetChatMessages).values({ projectId, role, content });
}

// ── Project Videos (Remotion) ─────────────────────────────────────────────────

export async function getProjectVideo(projectId: string) {
  const [video] = await db
    .select()
    .from(projectVideos)
    .where(eq(projectVideos.projectId, projectId))
    .orderBy(desc(projectVideos.updatedAt))
    .limit(1);
  return video ?? null;
}

export async function upsertProjectVideo(
  projectId: string,
  data: {
    remotionCode?: string;
    title?: string;
    width?: number;
    height?: number;
    durationInFrames?: number;
    fps?: number;
    videoUrl?: string;
    status?: string;
  }
) {
  const [existing] = await db
    .select()
    .from(projectVideos)
    .where(eq(projectVideos.projectId, projectId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(projectVideos)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectVideos.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(projectVideos)
      .values({
        projectId,
        remotionCode: data.remotionCode ?? '',
        title: data.title ?? 'Untitled Video',
        width: data.width ?? 1920,
        height: data.height ?? 1080,
        durationInFrames: data.durationInFrames ?? 150,
        fps: data.fps ?? 30,
        videoUrl: data.videoUrl,
        status: data.status ?? 'pending',
      })
      .returning();
    return created;
  }
}

export async function getVideoMessages(projectId: string) {
  return await db
    .select()
    .from(videoChatMessages)
    .where(eq(videoChatMessages.projectId, projectId))
    .orderBy(videoChatMessages.createdAt);
}

export async function saveVideoMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: any
) {
  await db.insert(videoChatMessages).values({ projectId, role, content });
}
