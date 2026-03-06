import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { agentSettings, teams, teamMembers, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function getOrCreateTeam(userId: string) {
  // Check if user is a team owner
  const ownedTeam = await db
    .select()
    .from(teams)
    .where(eq(teams.ownerId, userId))
    .limit(1);

  if (ownedTeam.length > 0) return ownedTeam[0];

  // Check if user is a member of a team
  const membership = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) return membership[0].team;

  // Create a default team for this user
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const teamName = user[0]?.name ? `${user[0].name}'s Team` : 'My Team';

  const [newTeam] = await db
    .insert(teams)
    .values({ name: teamName, ownerId: userId })
    .returning();
  return newTeam;
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const team = await getOrCreateTeam(session.user.id);

    const settings = await db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.teamId, team.id))
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

    const team = await getOrCreateTeam(session.user.id);

    // Check if settings already exist
    const existing = await db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.teamId, team.id))
      .limit(1);

    if (existing.length > 0) {
      // Update existing settings
      await db
        .update(agentSettings)
        .set({
          designGuidelines,
          updatedAt: new Date()
        })
        .where(eq(agentSettings.id, existing[0].id));
    } else {
      // Create new settings
      await db.insert(agentSettings).values({
        teamId: team.id,
        designGuidelines,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving agent settings:', error);
    return NextResponse.json({ error: 'Failed to save agent settings' }, { status: 500 });
  }
}
