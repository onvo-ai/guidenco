import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { teams, teamMembers, teamInvites, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendInviteEmail } from '@/lib/resend';

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

    const members = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        name: users.name,
        email: users.email,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, team.id));

    const invites = await db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.teamId, team.id));

    const owner = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, team.ownerId))
      .limit(1);

    return NextResponse.json({
      team,
      owner: owner[0] ?? null,
      members,
      invites,
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, email, name, memberId } = await req.json();

    const team = await getOrCreateTeam(session.user.id);

    if (action === 'invite') {
      if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

      // Check if already a member
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        const alreadyMember = await db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, team.id),
              eq(teamMembers.userId, existingUser[0].id)
            )
          )
          .limit(1);
        if (alreadyMember.length > 0) {
          return Response.json({ error: 'User is already a team member' }, { status: 400 });
        }
      }

      // Check if already invited
      const existingInvite = await db
        .select()
        .from(teamInvites)
        .where(
          and(
            eq(teamInvites.teamId, team.id),
            eq(teamInvites.email, email),
            eq(teamInvites.status, 'pending')
          )
        )
        .limit(1);

      if (existingInvite.length > 0) {
        return Response.json({ error: 'Invite already sent to this email' }, { status: 400 });
      }

      await db.insert(teamInvites).values({
        teamId: team.id,
        email,
        name: name || null,
        invitedBy: session.user.id,
        status: 'pending',
      });

      await sendInviteEmail({
        to: email,
        toName: name,
        inviterName: session.user.name || 'A teammate',
        teamName: team.name,
      });

      return Response.json({ success: true });
    }

    if (action === 'removeMember') {
      if (!memberId) return Response.json({ error: 'Member ID required' }, { status: 400 });
      // Only owner can remove members
      if (team.ownerId !== session.user.id) {
        return Response.json({ error: 'Only the team owner can remove members' }, { status: 403 });
      }
      await db.delete(teamMembers).where(eq(teamMembers.id, memberId));
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error in team action:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
