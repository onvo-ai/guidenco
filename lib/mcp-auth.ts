import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mcpTokens, users } from '@/lib/db/schema';

const TOKEN_PREFIX = 'gdc_mcp_';

export function generateRawMcpToken() {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function hashMcpToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getTokenPreview(token: string) {
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

export async function issueMcpTokenForUser(userId: string) {
  const rawToken = generateRawMcpToken();
  const tokenHash = hashMcpToken(rawToken);
  const tokenPreview = getTokenPreview(rawToken);

  await db.delete(mcpTokens).where(eq(mcpTokens.userId, userId));

  const [record] = await db
    .insert(mcpTokens)
    .values({
      userId,
      tokenHash,
      tokenPreview,
    })
    .returning();

  return {
    rawToken,
    record,
  };
}

export async function revokeMcpTokenForUser(userId: string) {
  await db.delete(mcpTokens).where(eq(mcpTokens.userId, userId));
}

export async function getMcpTokenForUser(userId: string) {
  const [record] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
    .limit(1);

  return record ?? null;
}

export async function authenticateMcpBearerToken(token: string) {
  const tokenHash = hashMcpToken(token);

  const [record] = await db
    .select({
      id: mcpTokens.id,
      userId: mcpTokens.userId,
      tokenPreview: mcpTokens.tokenPreview,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(mcpTokens)
    .innerJoin(users, eq(users.id, mcpTokens.userId))
    .where(and(eq(mcpTokens.tokenHash, tokenHash), isNull(mcpTokens.revokedAt)))
    .limit(1);

  if (!record) return null;

  await db
    .update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, record.id));

  return {
    id: record.userId,
    name: record.userName,
    email: record.userEmail,
    tokenPreview: record.tokenPreview,
  };
}
