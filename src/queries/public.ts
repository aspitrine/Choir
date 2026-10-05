import { queryOptions } from '@tanstack/react-query'
import { getPublicAssetUrlsFn, getPublicPlaylistFn } from '@/server/shareLinks'
import { publicKeys } from './keys'

// Presigned URLs live 15 minutes: refresh well before, and never reuse old ones.
const PRESIGNED_URL_FRESHNESS = 5 * 60 * 1000

export const publicQueries = {
  playlist: (token: string) =>
    queryOptions({
      queryKey: publicKeys.playlist(token),
      queryFn: () => getPublicPlaylistFn({ data: { token } }),
      staleTime: PRESIGNED_URL_FRESHNESS,
      // An unknown or revoked token won't start working on retry.
      retry: false,
    }),
  /** Fresh presigned URLs, fetched on demand (expired playback, PDF merge). */
  assetUrls: (token: string, assetIds: ReadonlyArray<string>) =>
    queryOptions({
      queryKey: publicKeys.assetUrls(token, assetIds),
      queryFn: () => getPublicAssetUrlsFn({ data: { token, assetIds: [...assetIds] } }),
      staleTime: 0,
    }),
}

export { publicKeys }
