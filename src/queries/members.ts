import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { searchInvitationsFn, searchMembersFn } from '@/server/members'
import type { PageParams } from '@/domain/pagination'
import { memberKeys } from './keys'

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
