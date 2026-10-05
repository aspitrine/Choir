import type { PageParams } from '@/shared/domain/pagination'

// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const songKeys = {
  all: ['songs'] as const,
  lists: () => [...songKeys.all, 'list'] as const,
  list: (params: PageParams) => [...songKeys.lists(), params] as const,
  details: () => [...songKeys.all, 'detail'] as const,
  detail: (songId: string) => [...songKeys.details(), songId] as const,
}
