import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createEntity,
  listEntities,
  createExperiment,
} from "@/lib/db/entities-service";
import { getOrCreateOrganizationId } from "@/lib/organization";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = await getOrCreateOrganizationId(session.user.id);
    const entities = await listEntities(organizationId);
    return NextResponse.json(entities);
  } catch (error) {
    console.error("Error fetching entities:", error);
    return NextResponse.json(
      { error: "Failed to fetch entities" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, type = "document", experiment } = await req.json();
    const organizationId = await getOrCreateOrganizationId(session.user.id);
    const entity = await createEntity(organizationId, name, type);

    if (experiment) {
      await createExperiment(organizationId, entity.id, type, {
        maxDepth: experiment.maxDepth,
        maxIterations: experiment.maxIterations,
        timeLimit: experiment.timeLimit
          ? new Date(experiment.timeLimit)
          : undefined,
        parameters: experiment.parameters ?? [],
      });
    }

    return Response.json(entity);
  } catch (error) {
    console.error("Error creating entity:", error);
    return Response.json({ error: "Failed to create entity" }, { status: 500 });
  }
}
