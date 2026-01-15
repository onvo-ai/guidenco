import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { projects, artworks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createProject } from '@/lib/db/projects-service';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get projects with their artwork thumbnails, ordered by most recently updated
    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        userId: projects.userId,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        thumbnail: artworks.thumbnail,
      })
      .from(projects)
      .leftJoin(artworks, eq(artworks.projectId, projects.id))
      .where(eq(projects.userId, session.user.id))
      .orderBy(desc(projects.updatedAt));

    return NextResponse.json(userProjects);
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

    const { name } = await req.json();
    const project = await createProject(session.user.id, name);
    return Response.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return Response.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
