import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionQueries } from '@/features/auth/ui/queries'
import { Home } from '@/features/auth/ui/login-page'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context: { queryClient } }) => {
    const session = await queryClient.fetchQuery(sessionQueries.current())
    if (session) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Home,
})
