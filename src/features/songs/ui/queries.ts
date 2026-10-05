import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { getSongFn, listSongsFn } from '@/features/songs/server/songs.functions'
import type { PageParams } from '@/shared/domain/pagination'
import { songKeys } from './keys'

export const songQueries = {
  list: (params: PageParams) =>
    queryOptions({
      queryKey: songKeys.list(params),
      queryFn: () => listSongsFn({ data: params }),
      // Keep the current page on screen while the next search/page loads.
      placeholderData: keepPreviousData,
    }),
  // Song + its files (with short-lived presigned URLs) and their group tags.
  detail: (songId: string) =>
    queryOptions({
      queryKey: songKeys.detail(songId),
      queryFn: () => getSongFn({ data: { songId } }),
      // Presigned file URLs expire after 15 minutes.
      staleTime: 5 * 60 * 1000,
    }),
}

export { songKeys }
