import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import {
  createExperiment,
  getExperimentsForEntity,
  getExperimentById,
  updateExperimentStatus,
  addExperimentScore,
  deleteExperiment,
} from '@/lib/db/entities-service';
import { getOrCreateOrganizationId } from '@/lib/organization';

// GET /api/experiments?entityId=xxx
export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const entityId = searchParams.get('entityId');
    const experimentId = searchParams.get('experimentId');

    if (experimentId) {
      const experiment = await getExperimentById(experimentId);
      if (!experiment) {
        return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
      }
      return NextResponse.json(experiment);
    }

    if (!entityId) {
      return NextResponse.json({ error: 'entityId or experimentId required' }, { status: 400 });
    }

    const experiments = await getExperimentsForEntity(entityId);
    return NextResponse.json(experiments);
  } catch (error) {
    console.error('Error fetching experiments:', error);
    return NextResponse.json({ error: 'Failed to fetch experiments' }, { status: 500 });
  }
}

// POST /api/experiments — create a new experiment
export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = await getOrCreateOrganizationId(session.user.id);
    const body = await req.json();
    const {
      entityId,
      entityType,
      name,
      maxDepth,
      maxIterations,
      timeLimit,
      startDate,
      endDate,
      checkInInterval,
      goalMetric,
      parameters,
    } = body;

    if (!entityId || !entityType) {
      return NextResponse.json({ error: 'entityId and entityType are required' }, { status: 400 });
    }

    const experiment = await createExperiment(
      entityId,
      entityType,
      {
        name,
        maxDepth,
        maxIterations,
        timeLimit: timeLimit ? new Date(timeLimit) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        checkInInterval,
        goalMetric,
        parameters: parameters ?? [],
      },
      organizationId
    );

    return NextResponse.json(experiment);
  } catch (error) {
    console.error('Error creating experiment:', error);
    return NextResponse.json({ error: 'Failed to create experiment' }, { status: 500 });
  }
}

// PATCH /api/experiments — update status or add a score
export async function PATCH(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { experimentId, status, score, iteration, notes } = body;

    if (!experimentId) {
      return NextResponse.json({ error: 'experimentId is required' }, { status: 400 });
    }

    if (status) {
      const updated = await updateExperimentStatus(experimentId, status);
      return NextResponse.json(updated);
    }

    if (score !== undefined && iteration !== undefined) {
      const updated = await addExperimentScore(experimentId, score, iteration, notes);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  } catch (error) {
    console.error('Error updating experiment:', error);
    return NextResponse.json({ error: 'Failed to update experiment' }, { status: 500 });
  }
}

// DELETE /api/experiments?experimentId=xxx
export async function DELETE(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const experimentId = searchParams.get('experimentId');
    if (!experimentId) {
      return NextResponse.json({ error: 'experimentId required' }, { status: 400 });
    }

    await deleteExperiment(experimentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json({ error: 'Failed to delete experiment' }, { status: 500 });
  }
}
