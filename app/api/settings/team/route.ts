import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

function slugifyOrganizationName(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return base || 'my-team';
}

function buildUniqueOrganizationSlug(name: string, userId: string) {
  const base = slugifyOrganizationName(name);
  const suffix = userId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8);
  return suffix ? `${base}-${suffix}` : base;
}

async function getOrCreateOrganization(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const existingOrganization = organizations[0];

  if (existingOrganization) {
    if (session.session.activeOrganizationId !== existingOrganization.id) {
      await auth.api.setActiveOrganization({
        headers: requestHeaders,
        body: { organizationId: existingOrganization.id },
      });
    }

    return existingOrganization;
  }

  const organizationName = session.user.name ? `${session.user.name}'s Team` : 'My Team';
  const organization = await auth.api.createOrganization({
    headers: requestHeaders,
    body: {
      name: organizationName,
      slug: buildUniqueOrganizationSlug(organizationName, session.user.id),
    },
  });

  return organization;
}

export async function GET() {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const organization = await getOrCreateOrganization(requestHeaders);
    if (!organization) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const fullOrganization = await auth.api.getFullOrganization({
      headers: requestHeaders,
      query: { organizationId: organization.id },
    });

    const members = (fullOrganization?.members ?? []).map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      joinedAt: member.createdAt,
    }));

    const ownerMember = (fullOrganization?.members ?? []).find((member) => member.role === 'owner');

    return NextResponse.json({
      team: {
        id: organization.id,
        name: organization.name,
        ownerId: ownerMember?.userId ?? session.user.id,
      },
      owner: ownerMember
        ? {
          name: ownerMember.user.name,
          email: ownerMember.user.email,
        }
        : {
          name: session.user.name,
          email: session.user.email,
        },
      members,
      invites: (fullOrganization?.invitations ?? []).map((invite) => ({
        id: invite.id,
        email: invite.email,
        status: invite.status,
        createdAt: invite.expiresAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, email, memberId, invitationId } = await req.json();

    const organization = await getOrCreateOrganization(requestHeaders);
    if (!organization) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (action === 'invite') {
      if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
      const invite = await auth.api.createInvitation({
        headers: requestHeaders,
        body: {
          email,
          role: 'member',
          organizationId: organization.id,
        },
      });

      return Response.json({ success: true, invite });
    }

    if (action === 'removeMember') {
      if (!memberId) return Response.json({ error: 'Member ID required' }, { status: 400 });

      await auth.api.removeMember({
        headers: requestHeaders,
        body: {
          memberIdOrEmail: memberId,
          organizationId: organization.id,
        },
      });

      return Response.json({ success: true });
    }

    if (action === 'cancelInvite') {
      if (!invitationId) return Response.json({ error: 'Invitation ID required' }, { status: 400 });

      await auth.api.cancelInvitation({
        headers: requestHeaders,
        body: { invitationId },
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error in team action:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
