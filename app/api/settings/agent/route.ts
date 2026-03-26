import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { agentSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getOrCreateOrganizationId } from '@/lib/organization';

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const organizationId = await getOrCreateOrganizationId(session.user.id);

    const settings = await db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.organizationId, organizationId))
      .limit(1);

    return NextResponse.json(settings[0] || { designGuidelines: '' });
  } catch (error) {
    console.error('Error fetching agent settings:', error);
    return NextResponse.json({ error: 'Failed to fetch agent settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { designGuidelines } = await req.json();

    if (typeof designGuidelines !== 'string') {
      return Response.json({ error: 'Design guidelines must be a string' }, { status: 400 });
    }

    const organizationId = await getOrCreateOrganizationId(session.user.id);

    const existing = await db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.organizationId, organizationId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(agentSettings)
        .set({ designGuidelines, updatedAt: new Date() })
        .where(eq(agentSettings.id, existing[0].id));
    } else {
      await db.insert(agentSettings).values({ organizationId, designGuidelines });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving agent settings:', error);
    return NextResponse.json({ error: 'Failed to save agent settings' }, { status: 500 });
  }
}
