import { queryOptions } from '@tanstack/react-query'
import { getPlaylistFn, listPlaylistsFn, listUpcomingPlaylistsFn } from '@/server/playlists'
import { listShareLinksFn } from '@/server/shareLinks'
import { playlistKeys } from './keys'

export const playlistQueries = {
  list: () => queryOptions({ queryKey: playlistKeys.list(), queryFn: () => listPlaylistsFn() }),
  upcoming: () => queryOptions({ queryKey: playlistKeys.upcoming(), queryFn: () => listUpcomingPlaylistsFn() }),
  /** Playlist, its ordered items and its event dates. */
  detail: (playlistId: string) =>
    queryOptions({ queryKey: playlistKeys.detail(playlistId), queryFn: () => getPlaylistFn({ data: { playlistId } }) }),
  shareLinks: (playlistId: string) =>
    queryOptions({
      queryKey: playlistKeys.shareLinks(playlistId),
      queryFn: () => listShareLinksFn({ data: { playlistId } }),
    }),
}

export { playlistKeys }
