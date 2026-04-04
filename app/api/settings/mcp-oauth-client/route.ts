import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthApplications } from '@/lib/db/schema';

const MCP_CLIENT_NAME = 'Guidenco Claude MCP';
const DEFAULT_REDIRECT_URIS = [
  'http://localhost:8080/callback',
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

function parseRedirectUrls(value: string | null | undefined) {
  if (!value) return DEFAULT_REDIRECT_URIS;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch { }

  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function requireSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [client] = await db
    .select({
      clientId: oauthApplications.clientId,
      createdAt: oauthApplications.createdAt,
      updatedAt: oauthApplications.updatedAt,
      disabled: oauthApplications.disabled,
      redirectURLs: oauthApplications.redirectURLs,
    })
    .from(oauthApplications)
    .where(and(eq(oauthApplications.userId, session.user.id), eq(oauthApplications.name, MCP_CLIENT_NAME)))
    .limit(1);

  return NextResponse.json({
    hasClient: Boolean(client),
    clientId: client?.clientId ?? null,
    createdAt: client?.createdAt ?? null,
    updatedAt: client?.updatedAt ?? null,
    disabled: client?.disabled ?? false,
    redirectURLs: parseRedirectUrls(client?.redirectURLs),
  });
}

export async function POST() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const registerMcpClient = (auth.api as any).registerMcpClient as
    | ((input: { headers: Headers; body: Record<string, unknown> }) => Promise<any>)
    | undefined;

  if (!registerMcpClient) {
    return NextResponse.json({ error: 'MCP client registration is not available' }, { status: 500 });
  }

  await db
    .delete(oauthApplications)
    .where(and(eq(oauthApplications.userId, session.user.id), eq(oauthApplications.name, MCP_CLIENT_NAME)));

  const clientResponse = await registerMcpClient({
    headers: requestHeaders,
    body: {
      redirect_uris: DEFAULT_REDIRECT_URIS,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: MCP_CLIENT_NAME,
      scope: 'openid profile email offline_access mcp:tools',
      metadata: {
        purpose: 'guidenco-mcp-claude',
      },
    },
  });

  const client = (clientResponse instanceof Response ? await clientResponse.json() : clientResponse) as {
    client_id: string;
    client_secret?: string;
    client_id_issued_at: number;
    client_secret_expires_at?: number;
    redirect_uris: string[];
  };

  return NextResponse.json({
    clientId: client.client_id,
    clientSecret: client.client_secret ?? null,
    createdAt: new Date(client.client_id_issued_at * 1000).toISOString(),
    clientSecretExpiresAt: client.client_secret_expires_at,
    redirectURLs: client.redirect_uris,
  });
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await db
    .delete(oauthApplications)
    .where(and(eq(oauthApplications.userId, session.user.id), eq(oauthApplications.name, MCP_CLIENT_NAME)));

  return NextResponse.json({ success: true });
}
