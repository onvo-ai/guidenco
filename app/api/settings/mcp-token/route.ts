import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getMcpTokenForUser, issueMcpTokenForUser, revokeMcpTokenForUser } from '@/lib/mcp-auth';

async function requireSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = await getMcpTokenForUser(session.user.id);
  return NextResponse.json({
    hasToken: Boolean(token),
    tokenPreview: token?.tokenPreview ?? null,
    createdAt: token?.createdAt ?? null,
    lastUsedAt: token?.lastUsedAt ?? null,
  });
}

export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rawToken, record } = await issueMcpTokenForUser(session.user.id);
  return NextResponse.json({
    token: rawToken,
    tokenPreview: record.tokenPreview,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await revokeMcpTokenForUser(session.user.id);
  return NextResponse.json({ success: true });
}
