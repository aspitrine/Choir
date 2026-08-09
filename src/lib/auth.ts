import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { genericOAuth, microsoftEntraId } from 'better-auth/plugins/generic-oauth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db/client'

export const auth = betterAuth({
  baseURL: process.env.BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg' }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  emailAndPassword: {
    // Fallback for invitees without Google/Microsoft. No mail server, so no
    // verification email — the private invite link is the trust anchor instead.
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    organization({
      // Directors create a choir (org) after sign-in; membership is invite-only after that.
      allowUserToCreateOrganization: true,
      creatorRole: 'owner',
      // Invites are never emailed (no sendInvitationEmail configured) and password
      // signups never get a verified email either — don't gate acceptance on it.
      requireEmailVerificationOnInvitation: false,
      schema: {
        invitation: {
          additionalFields: {
            firstName: { type: 'string', required: false },
            lastName: { type: 'string', required: false },
          },
        },
      },
    }),
    genericOAuth({
      config: [
        {
          ...microsoftEntraId({
            clientId: process.env.MICROSOFT_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            tenantId: process.env.MICROSOFT_TENANT_ID!,
          }),
          // Personal Microsoft accounts don't reliably return name/given_name/family_name
          // from the OIDC userinfo endpoint — fall back to the email's local part rather
          // than fail sign-in on a required `name` field.
          mapProfileToUser: (profile: { name?: string; email?: string }) => ({
            name: profile.name || profile.email?.split('@')[0] || 'Utilisateur',
          }),
        },
      ],
    }),
    // Must stay last: handles cookie writes for server-side auth calls.
    tanstackStartCookies(),
  ],
})

export type Auth = typeof auth
