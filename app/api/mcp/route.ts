import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sessions as sessionsTable, organizationMembers } from '@/lib/db/schema';
import { createGuidencoMcpServer } from '@/lib/mcp-server';
import { authenticateMcpBearerToken } from '@/lib/mcp-auth';

type SessionState = {
  transport: WebStandardStreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
};

const globalState = globalThis as typeof globalThis & {
  __guidencoMcpHttpSessions?: Map<string, SessionState>;
};

const sessions = globalState.__guidencoMcpHttpSessions ?? new Map<string, SessionState>();
globalState.__guidencoMcpHttpSessions = sessions;

export const runtime = 'nodejs';

function getBaseUrl(request: Request) {
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice('Bearer '.length).trim();
}

function getProtectedResourceMetadataUrl(request: Request) {
  return `${getBaseUrl(request)}/.well-known/oauth-protected-resource`;
}

function createUnauthorizedResponse(request: Request, method: 'GET' | 'POST' | 'DELETE', message: string) {
  const headers = {
    'WWW-Authenticate': `Bearer resource_metadata="${getProtectedResourceMetadataUrl(request)}"`,
  };

  return method === 'GET'
    ? new NextResponse(message, { status: 401, headers })
    : NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message,
        },
        id: null,
      },
      { status: 401, headers }
    );
}

function createJsonRpcErrorResponse(status: number, code: number, message: string) {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: {
        code,
        message,
      },
      id: null,
    },
    { status }
  );
}

async function handleMcpRequest(request: Request, method: 'GET' | 'POST' | 'DELETE') {
  const token = getBearerToken(request);
  if (!token) {
    return createUnauthorizedResponse(request, method, 'Missing bearer token');
  }

  const mcpSession = await auth.api.getMcpSession({ headers: request.headers });
  const user = mcpSession
    ? {
      id: mcpSession.userId,
    }
    : await authenticateMcpBearerToken(token);

  if (!user) {
    return createUnauthorizedResponse(request, method, 'Invalid bearer token');
  }

  const sessionId = request.headers.get('mcp-session-id');
  let parsedBody: unknown;

  if (method === 'POST') {
    try {
      parsedBody = await request.json();
    } catch {
      return createJsonRpcErrorResponse(400, -32700, 'Invalid JSON body');
    }
  }

  try {
    let session = sessionId ? sessions.get(sessionId) : undefined;

    if (!session && method === 'POST' && isInitializeRequest(parsedBody)) {
      // Look up the user's active organization ID
      let organizationId: string | null = null;
      const sessionRow = await db
        .select({ activeOrganizationId: sessionsTable.activeOrganizationId })
        .from(sessionsTable)
        .where(eq(sessionsTable.userId, user.id))
        .orderBy(desc(sessionsTable.updatedAt))
        .limit(1);
      organizationId = sessionRow[0]?.activeOrganizationId ?? null;

      // Fall back to any org membership if no active org in session
      if (!organizationId) {
        const memberRow = await db
          .select({ organizationId: organizationMembers.organizationId })
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, user.id))
          .limit(1);
        organizationId = memberRow[0]?.organizationId ?? null;
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          sessions.set(initializedSessionId, {
            transport,
            closeServer: () => server.close(),
          });
        },
        onsessionclosed: async (closedSessionId) => {
          const closedSession = sessions.get(closedSessionId);
          sessions.delete(closedSessionId);
          await closedSession?.closeServer().catch(() => { });
        },
      });

      const server = createGuidencoMcpServer({
        userId: user.id,
        organizationId,
        accessToken: token,
        baseUrl: getBaseUrl(request),
      });

      transport.onclose = async () => {
        const activeSessionId = transport.sessionId;
        if (!activeSessionId) return;
        const activeSession = sessions.get(activeSessionId);
        sessions.delete(activeSessionId);
        await activeSession?.closeServer().catch(() => { });
      };

      await server.connect(transport);

      return transport.handleRequest(request, {
        ...(parsedBody === undefined ? {} : { parsedBody }),
      });
    }

    if (!session) {
      if (method === 'POST') {
        return createJsonRpcErrorResponse(400, -32000, 'Bad Request: No valid session ID provided');
      }

      return new NextResponse('Invalid or missing session ID', { status: 400 });
    }

    return session.transport.handleRequest(request, {
      ...(parsedBody === undefined ? {} : { parsedBody }),
    });
  } catch (error) {
    console.error('Failed to handle MCP request:', error);
    return method === 'GET'
      ? new NextResponse('Failed to handle MCP request', { status: 500 })
      : createJsonRpcErrorResponse(500, -32603, 'Internal server error');
  }
}

export async function GET(request: Request) {
  return handleMcpRequest(request, 'GET');
}

export async function POST(request: Request) {
  return handleMcpRequest(request, 'POST');
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request, 'DELETE');
}
