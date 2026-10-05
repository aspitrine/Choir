import { createFileRoute } from '@tanstack/react-router'
import { Schema } from 'effect'
import { groupQueries } from '@/features/groups/ui/queries'
import { GroupsPage } from '@/features/groups/ui/groups-page'

const GroupsSearch = Schema.Struct({
  q: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Number),
})

export const Route = createFileRoute('/_authed/groups/')({
  validateSearch: (search) => Schema.decodeUnknownSync(GroupsSearch)(search),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', page: search.page ?? 1 }),
  loader: ({ deps, context: { queryClient } }) => queryClient.ensureQueryData(groupQueries.search(deps)),
  component: GroupsPage,
})
