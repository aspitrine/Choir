import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { searchInvitationsFn, searchMembersFn } from '@/features/members/server/members.functions'
import type { PageParams } from '@/shared/domain/pagination'
import { memberKeys } from './keys'

/** What the members page shows first (prefetched by its loader). */
export const FIRST_PAGE: PageParams = { q: '', page: 1 }

export const memberQueries = {
  list: (params: PageParams) =>
    queryOptions({
      queryKey: memberKeys.list(params),
      queryFn: () => searchMembersFn({ data: params }),
      placeholderData: keepPreviousData,
    }),
  invitations: (params: PageParams) =>
    queryOptions({
      queryKey: memberKeys.invitations(params),
      queryFn: () => searchInvitationsFn({ data: params }),
      placeholderData: keepPreviousData,
    }),
}

export { memberKeys }
