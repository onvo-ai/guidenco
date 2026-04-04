import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';

const baseHandler = oAuthDiscoveryMetadata(auth);

function getRequestBaseUrl(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const response = await baseHandler(request as any);
  const requestBaseUrl = getRequestBaseUrl(request);
  const authBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // If the request is coming from the same origin as configured, no rewrite needed
  if (requestBaseUrl === authBaseUrl) {
    return response;
  }

  // Rewrite all URLs in the discovery document to match the request host
  const data = await response.json() as Record<string, unknown>;
  const rewritten: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.startsWith(authBaseUrl)) {
      rewritten[key] = value.replace(authBaseUrl, requestBaseUrl);
    } else if (Array.isArray(value)) {
      rewritten[key] = value.map((item) =>
        typeof item === 'string' && item.startsWith(authBaseUrl)
          ? item.replace(authBaseUrl, requestBaseUrl)
          : item
      );
    } else {
      rewritten[key] = value;
    }
  }

  return NextResponse.json(rewritten, {
    headers: { 'access-control-allow-origin': '*' },
  });
}
