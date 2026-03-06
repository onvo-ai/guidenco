import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { projects, artworks, artworkVersions } from '@/lib/db/schema';
import { eq, desc, count } from 'drizzle-orm';
import { createProject } from '@/lib/db/projects-service';

const PAGE_BREAK = '\n<!-- PAGE_BREAK -->\n';
const PAGE_BREAK_LEGACY_GUIDENCO = '\n<!-- GUIDENCO_PAGE_BREAK -->\n';
const PAGE_BREAK_LEGACY_ARTISTE = '\n<!-- ARTISTE_PAGE_BREAK -->\n';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get projects with their artwork info, ordered by most recently updated
    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        type: projects.type,
        userId: projects.userId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        thumbnail: artworks.thumbnail,
        artworkId: artworks.id,
        currentVersion: artworks.currentVersion,
      })
      .from(projects)
      .leftJoin(artworks, eq(artworks.projectId, projects.id))
      .where(eq(projects.userId, session.user.id))
      .orderBy(desc(projects.updatedAt));

    // For projects that have artwork, fetch version counts and current HTML for page count
    const results = await Promise.all(userProjects.map(async (project) => {
      if (!project.artworkId) {
        return { ...project, versionCount: 0, pageCount: 0 };
      }

      // Get total version count
      const [{ value: versionCount }] = await db
        .select({ value: count() })
        .from(artworkVersions)
        .where(eq(artworkVersions.artworkId, project.artworkId));

      // Get current version HTML to count pages
      const currentVersionRows = await db
        .select({ html: artworkVersions.html })
        .from(artworkVersions)
        .where(eq(artworkVersions.artworkId, project.artworkId))
        .orderBy(desc(artworkVersions.version))
        .limit(1);

      const html = currentVersionRows[0]?.html ?? '';
      const normalised = html
        .split(PAGE_BREAK_LEGACY_GUIDENCO).join(PAGE_BREAK)
        .split(PAGE_BREAK_LEGACY_ARTISTE).join(PAGE_BREAK);
      const pageCount = html ? normalised.split(PAGE_BREAK).length : 0;

      return { ...project, versionCount: Number(versionCount), pageCount };
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, type = 'artwork' } = await req.json();
    const project = await createProject(session.user.id, name, type);
    return Response.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return Response.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
