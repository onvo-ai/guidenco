import { auth } from '@/lib/auth';
import { deleteEntity } from '@/lib/db/entities-service';
import { headers } from 'next/headers';
import { getOrCreateOrganizationId } from '@/lib/organization';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const organizationId = await getOrCreateOrganizationId(session.user.id);
    await deleteEntity(id, organizationId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting entity:', error);
    return Response.json({ error: 'Failed to delete entity' }, { status: 500 });
  }
}
