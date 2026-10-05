import { createFileRoute } from '@tanstack/react-router'
import { playlistQueries } from '@/features/playlists/ui/queries'
import { PlaylistsPage } from '@/features/playlists/ui/playlists-page'

export const Route = createFileRoute('/_authed/playlists/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(playlistQueries.list()),
  component: PlaylistsPage,
})
