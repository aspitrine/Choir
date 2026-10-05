import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionQueries } from '@/features/auth/ui/queries'
import { AuthedLayout } from '@/app/shell/authed-layout'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location, context: { queryClient } }) => {
    // fetchQuery honours staleTime: navigating between pages reuses the cached
    // session and role instead of two server round-trips per navigation.
    const session = await queryClient.fetchQuery(sessionQueries.current())

    if (!session) {
      throw redirect({ to: '/' })
    }

    // No role = no active org yet (e.g. just signed up) or no longer a member of it.
    // Only the dashboard (with its org picker) makes sense then.
    const role = await queryClient.fetchQuery(sessionQueries.role())
    if (role === null && location.pathname !== '/dashboard') {
      throw redirect({ to: '/dashboard' })
    }

    return { session }
  },
  component: AuthedLayout,
})
