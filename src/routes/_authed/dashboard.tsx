import { createFileRoute } from '@tanstack/react-router'
import { playlistQueries } from '@/features/playlists/ui/queries'
import { sessionQueries } from '@/features/auth/ui/queries'
import { Dashboard } from '@/features/playlists/ui/dashboard-page'

export const Route = createFileRoute('/_authed/dashboard')({
  // No active choir → nothing to load; the page offers the choir picker instead.
  loader: async ({ context: { queryClient } }) => {
    const role = await queryClient.ensureQueryData(sessionQueries.role())
    if (role !== null) await queryClient.ensureQueryData(playlistQueries.upcoming())
  },
  component: Dashboard,
})
