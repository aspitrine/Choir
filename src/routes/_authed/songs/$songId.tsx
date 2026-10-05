import { createFileRoute, redirect } from '@tanstack/react-router'
import { songQueries } from '@/features/songs/ui/queries'
import { groupQueries } from '@/features/groups/ui/queries'
import { SongDetailPage } from '@/features/songs/ui/song-page'

export const Route = createFileRoute('/_authed/songs/$songId')({
  loader: async ({ params, context: { queryClient } }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(songQueries.detail(params.songId)),
        queryClient.ensureQueryData(groupQueries.options()),
      ])
    } catch {
      throw redirect({ to: '/songs' })
    }
  },
  component: SongDetailPage,
})
