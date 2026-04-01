import { db } from "@/lib/db";
import { organizations, organizationMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

function buildUniqueSlug(name: string, userId: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "my-org";
  const suffix = userId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8);
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Returns the organization ID for a user, or null if they have no org.
 */
export async function getOrganizationId(userId: string): Promise<string | null> {
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId))
    .limit(1);
  return membership?.organizationId ?? null;
}

/**
 * Returns the organization ID for a user, creating a personal org if one
 * does not yet exist.
 */
export async function getOrCreateOrganizationId(userId: string): Promise<string> {
  const existing = await getOrganizationId(userId);
  if (existing) return existing;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const orgName = user?.name ? `${user.name}'s Team` : "My Team";
  const slug = buildUniqueSlug(orgName, userId);

  const [newOrg] = await db
    .insert(organizations)
    .values({ id: randomUUID(), name: orgName, slug })
    .returning();

  await db.insert(organizationMembers).values({
    id: randomUUID(),
    organizationId: newOrg.id,
    userId,
    role: "owner",
  });

  return newOrg.id;
}
