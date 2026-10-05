import { queryOptions } from '@tanstack/react-query'
import { listGroupsFn, searchGroupsFn } from '@/features/groups/server/groups.functions'
import type { PageParams } from '@/shared/domain/pagination'
import { groupKeys } from './keys'

export const groupQueries = {
  /** Every group, for pickers. */
  options: () => queryOptions({ queryKey: groupKeys.options(), queryFn: () => listGroupsFn() }),
  search: (params: PageParams) =>
    queryOptions({ queryKey: groupKeys.search(params), queryFn: () => searchGroupsFn({ data: params }) }),
}

export { groupKeys }
