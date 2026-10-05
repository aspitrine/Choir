import type { PageParams } from '@/domain/pagination'

// Query key factories, by domain. Mutations invalidate by prefix (e.g. songKeys.all
// refetches every song list and detail), so each key extends its parent's.

export const songKeys = {
  all: ['songs'] as const,
  lists: () => [...songKeys.all, 'list'] as const,
  list: (params: PageParams) => [...songKeys.lists(), params] as const,
  details: () => [...songKeys.all, 'detail'] as const,
  detail: (songId: string) => [...songKeys.details(), songId] as const,
}

export const groupKeys = {
  all: ['groups'] as const,
  options: () => [...groupKeys.all, 'options'] as const,
  search: (params: PageParams) => [...groupKeys.all, 'search', params] as const,
}

export const playlistKeys = {
  all: ['playlists'] as const,
  list: () => [...playlistKeys.all, 'list'] as const,
  upcoming: () => [...playlistKeys.all, 'upcoming'] as const,
  detail: (playlistId: string) => [...playlistKeys.all, 'detail', playlistId] as const,
  shareLinks: (playlistId: string) => [...playlistKeys.detail(playlistId), 'share-links'] as const,
}

export const memberKeys = {
  all: ['members'] as const,
  list: (params: PageParams) => [...memberKeys.all, 'list', params] as const,
  invitations: (params: PageParams) => [...memberKeys.all, 'invitations', params] as const,
}

export const publicKeys = {
  all: ['public'] as const,
  playlist: (token: string) => [...publicKeys.all, 'playlist', token] as const,
  assetUrls: (token: string, assetIds: ReadonlyArray<string>) =>
    [...publicKeys.playlist(token), 'asset-urls', assetIds] as const,
}

export const sessionKeys = {
  all: ['session'] as const,
  current: () => [...sessionKeys.all, 'current'] as const,
  role: () => [...sessionKeys.all, 'role'] as const,
}
