import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from './db/client'
import * as schema from './db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  // Explicitly trust localhost variants
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  advanced: {
    // Disable better-auth's Origin-header CSRF check. The session cookie is
    // already SameSite=Lax which prevents cross-origin POST attacks at the
    // browser level. The origin-header check is redundant and breaks in Arc /
    // Chromium when a session cookie is present because those browsers omit
    // the Origin header on same-origin fetch requests.
    disableCSRFCheck: true,
  },
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers })
}
