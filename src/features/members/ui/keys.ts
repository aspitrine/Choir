import type { PageParams } from '@/shared/domain/pagination'

// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const memberKeys = {
  all: ['members'] as const,
  list: (params: PageParams) => [...memberKeys.all, 'list', params] as const,
  invitations: (params: PageParams) => [...memberKeys.all, 'invitations', params] as const,
}
