import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { organizationMembers, organizationInvitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { ensureUserCredits } from '@/lib/billing';
import { getOrCreateOrganizationId } from '@/lib/organization';

/**
 * Called after a user signs up. Accepts any pending BetterAuth org invitation
 * matched by email, otherwise creates a personal organization.
 */
export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: userId, email } = session.user;

    // Check if already an org member
    const [existingMembership] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId))
      .limit(1);

    if (existingMembership) {
      await ensureUserCredits(existingMembership.organizationId);
      return Response.json({ joined: false, reason: 'already_member' });
    }

    // Look up pending BetterAuth org invitations by email
    const pendingInvites = await db
      .select()
      .from(organizationInvitations)
      .where(and(eq(organizationInvitations.email, email), eq(organizationInvitations.status, 'pending')));

    if (pendingInvites.length > 0) {
      const invite = pendingInvites[0];
      const { randomUUID } = await import('crypto');

      await db.insert(organizationMembers).values({
        id: randomUUID(),
        organizationId: invite.organizationId,
        userId,
        role: invite.role,
      });

      for (const inv of pendingInvites) {
        await db
          .update(organizationInvitations)
          .set({ status: 'accepted' })
          .where(eq(organizationInvitations.id, inv.id));
      }

      await ensureUserCredits(invite.organizationId);
      return Response.json({ joined: true, organizationId: invite.organizationId });
    }

    // No invite — create a personal organization
    const organizationId = await getOrCreateOrganizationId(userId);
    await ensureUserCredits(organizationId);
    return NextResponse.json({ joined: false, createdOrganization: organizationId });
  } catch (error) {
    console.error('Error in after-signup:', error);
    return NextResponse.json({ error: 'After-signup failed' }, { status: 500 });
  }
}
