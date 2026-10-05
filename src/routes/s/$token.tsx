import { createFileRoute, notFound } from '@tanstack/react-router'
import { publicQueries } from '@/features/sharing/ui/queries'
import { PublicPlaylistPage, LinkNotFound } from '@/features/sharing/ui/public-playlist-page'

export const Route = createFileRoute('/s/$token')({
  // Returned (not only cached) so `head` can build the link preview from it.
  loader: async ({ params, context: { queryClient } }) => {
    try {
      return await queryClient.ensureQueryData(publicQueries.playlist(params.token))
    } catch {
      throw notFound()
    }
  },
  notFoundComponent: LinkNotFound,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: 'Lien introuvable · Chorale' }] }
    }
    const { playlist, items } = loaderData
    const title = `${playlist.name} · Chorale`
    const description =
      playlist.description ||
      (items.length > 0
        ? items
            .slice(0, 5)
            .map((i) => i.song.title)
            .join(', ') + (items.length > 5 ? '…' : '')
        : 'Playlist partagée')
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: playlist.name },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'music.playlist' },
        { property: 'og:site_name', content: 'Chorale' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: playlist.name },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  component: PublicPlaylistPage,
})
