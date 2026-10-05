// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const publicKeys = {
  all: ['public'] as const,
  playlist: (token: string) => [...publicKeys.all, 'playlist', token] as const,
  assetUrls: (token: string, assetIds: ReadonlyArray<string>) =>
    [...publicKeys.playlist(token), 'asset-urls', assetIds] as const,
}
