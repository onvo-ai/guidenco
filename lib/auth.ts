import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt, mcp, organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendInviteEmail } from "@/lib/resend";
import * as dotenv from "dotenv";

// .env.local is the source of truth; .env is docker-compose only
dotenv.config({ path: '.env.local' });

const socialProviders = {
  google:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
      : undefined,
  facebook:
    process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
      ? {
        clientId: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      }
      : undefined,
  github:
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }
      : undefined,
};

function slugifyOrganizationName(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return base || 'my-team';
}

function buildUniqueOrganizationSlug(name: string, userId: string) {
  const base = slugifyOrganizationName(name);
  const suffix = userId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 8);
  return suffix ? `${base}-${suffix}` : base;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.organizationMembers,
      invitation: schema.organizationInvitations,
      jwks: schema.jwks,
      oauthApplication: schema.oauthApplications,
      oauthAccessToken: schema.oauthAccessTokens,
      oauthConsent: schema.oauthConsents,
    },
  }),
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "secret-key-for-development-only",
  trustedOrigins: [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:54898", // Windsurf preview
    "http://192.168.1.124:3000", // Network IP
    "https://69548579b876-1535628245315457793.ngrok-free.app",
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
  ],
  user: {
    modelName: "users",
  },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  account: {
    modelName: "accounts",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders,
  plugins: [
    jwt(),
    mcp({
      loginPage: "/auth/sign-in",
      resource: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/mcp`,
      oidcConfig: {
        loginPage: "/auth/sign-in",
        accessTokenExpiresIn: 60 * 60,
        refreshTokenExpiresIn: 60 * 60 * 24 * 30,
        codeExpiresIn: 60 * 10,
        scopes: ["openid", "profile", "email", "offline_access", "mcp:tools"],
        defaultScope: "openid profile email offline_access mcp:tools",
        allowDynamicClientRegistration: true,
        storeClientSecret: "hashed",
      },
    }),
    organization({
      allowUserToCreateOrganization: true,
      async sendInvitationEmail(data) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const inviteLink = `${appUrl}/auth/sign-in?invitationId=${encodeURIComponent(data.id)}`;

        await sendInviteEmail({
          to: data.email,
          inviterName: data.inviter.user.name || data.inviter.user.email || 'A teammate',
          teamName: data.organization.name,
          inviteLink,
        });
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization, user }) => ({
          data: {
            ...organization,
            slug: buildUniqueOrganizationSlug(String(organization.name ?? 'my-team'), String(user?.id ?? organization.name ?? 'org')),
          },
        }),
      },
    }),
  ],
  logger: {
    level: "debug",
    log: (message) => {
      console.log("[BetterAuth Log]:", message);
    },
  },
  advanced: {
    useSecureCookies: false,
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
