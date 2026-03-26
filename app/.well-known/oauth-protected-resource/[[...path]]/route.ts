import { NextRequest, NextResponse } from 'next/server';

function getBaseUrl(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);

  return NextResponse.json({
    resource: `${baseUrl}/api/mcp`,
    // Must match the issuer in /.well-known/oauth-authorization-server so Claude Code
    // can construct the correct RFC 8414 discovery URL: baseUrl + /.well-known/oauth-authorization-server
    authorization_servers: [baseUrl],
    jwks_uri: `${baseUrl}/api/auth/mcp/jwks`,
    scopes_supported: ['openid', 'profile', 'email', 'offline_access', 'mcp:tools'],
    bearer_methods_supported: ['header'],
  });
}
