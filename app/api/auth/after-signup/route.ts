import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { teams, teamMembers, teamInvites, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Called after a user signs up. Checks for pending invites by email
 * and joins the team if matched, otherwise creates a personal team.
 */
export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: userId, email } = session.user;

    // Check if already has a team
    const ownedTeam = await db
      .select()
      .from(teams)
      .where(eq(teams.ownerId, userId))
      .limit(1);
    if (ownedTeam.length > 0) return Response.json({ joined: false, reason: 'already_has_team' });

    const membership = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);
    if (membership.length > 0) return Response.json({ joined: false, reason: 'already_member' });

    // Look up pending invites by email
    const pendingInvites = await db
      .select()
      .from(teamInvites)
      .where(and(eq(teamInvites.email, email), eq(teamInvites.status, 'pending')));

    if (pendingInvites.length > 0) {
      // Join the first matching team (could handle multiple in future)
      const invite = pendingInvites[0];

      await db.insert(teamMembers).values({
        teamId: invite.teamId,
        userId,
        role: 'member',
      });

      // Mark all matching invites as accepted
      for (const inv of pendingInvites) {
        await db
          .update(teamInvites)
          .set({ status: 'accepted' })
          .where(eq(teamInvites.id, inv.id));
      }

      return Response.json({ joined: true, teamId: invite.teamId });
    }

    // No invite — create a personal team
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const teamName = user[0]?.name ? `${user[0].name}'s Team` : 'My Team';

    const [newTeam] = await db
      .insert(teams)
      .values({ name: teamName, ownerId: userId })
      .returning();

    return NextResponse.json({ joined: false, createdTeam: newTeam.id });
  } catch (error) {
    console.error('Error in after-signup:', error);
    return NextResponse.json({ error: 'After-signup failed' }, { status: 500 });
  }
}
