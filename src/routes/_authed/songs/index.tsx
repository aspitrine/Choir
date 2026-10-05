import { createFileRoute } from '@tanstack/react-router'
import { Schema } from 'effect'
import { songQueries } from '@/features/songs/ui/queries'
import { SongsPage } from '@/features/songs/ui/songs-page'

const SongsSearch = Schema.Struct({
  q: Schema.optional(Schema.String),
  page: Schema.optional(Schema.Number),
})

export const Route = createFileRoute('/_authed/songs/')({
  validateSearch: (search) => Schema.decodeUnknownSync(SongsSearch)(search),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', page: search.page ?? 1 }),
  loader: ({ deps, context: { queryClient } }) => queryClient.ensureQueryData(songQueries.list(deps)),
  component: SongsPage,
})
