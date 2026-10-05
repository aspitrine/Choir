// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const playlistKeys = {
  all: ['playlists'] as const,
  list: () => [...playlistKeys.all, 'list'] as const,
  upcoming: () => [...playlistKeys.all, 'upcoming'] as const,
  detail: (playlistId: string) => [...playlistKeys.all, 'detail', playlistId] as const,
  shareLinks: (playlistId: string) => [...playlistKeys.detail(playlistId), 'share-links'] as const,
}
