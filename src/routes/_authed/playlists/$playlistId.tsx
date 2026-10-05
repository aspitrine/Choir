import { createFileRoute, redirect } from '@tanstack/react-router'
import { playlistQueries } from '@/features/playlists/ui/queries'
import { groupQueries } from '@/features/groups/ui/queries'
import { PlaylistDetailPage } from '@/features/playlists/ui/playlist-page'

export const Route = createFileRoute('/_authed/playlists/$playlistId')({
  loader: async ({ params: { playlistId }, context: { queryClient } }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(playlistQueries.detail(playlistId)),
        queryClient.ensureQueryData(playlistQueries.shareLinks(playlistId)),
        queryClient.ensureQueryData(groupQueries.options()),
      ])
    } catch {
      throw redirect({ to: '/playlists' })
    }
  },
  component: PlaylistDetailPage,
})
