import { createAuthClient } from 'better-auth/react'
import { organizationClient, genericOAuthClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [organizationClient(), genericOAuthClient()],
})

export const { useSession, signIn, signOut } = authClient
