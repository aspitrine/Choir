import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
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
  plugins: [
    organization({
      // Directors create a choir (org) after Google sign-in; membership is invite-only after that.
      allowUserToCreateOrganization: true,
      creatorRole: 'owner',
    }),
    // Must stay last: handles cookie writes for server-side auth calls.
    tanstackStartCookies(),
  ],
})

export type Auth = typeof auth
