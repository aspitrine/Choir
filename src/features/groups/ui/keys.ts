import type { PageParams } from '@/shared/domain/pagination'

// Query keys, hierarchical: invalidating a prefix (e.g. the `all` key) refetches everything below it.
export const groupKeys = {
  all: ['groups'] as const,
  options: () => [...groupKeys.all, 'options'] as const,
  search: (params: PageParams) => [...groupKeys.all, 'search', params] as const,
}
