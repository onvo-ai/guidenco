import { auth } from '@/lib/auth';
import { authenticateMcpBearerToken } from '@/lib/mcp-auth';

export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export async function getAuthenticatedUser(requestHeaders: Headers): Promise<AuthenticatedUser | null> {
  const authorization = requestHeaders.get('authorization') || requestHeaders.get('Authorization');

  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) {
      const mcpSession = await auth.api.getMcpSession({ headers: requestHeaders });
      if (mcpSession) {
        return {
          id: mcpSession.userId,
        };
      }

      const user = await authenticateMcpBearerToken(token);
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      }
    }
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}
