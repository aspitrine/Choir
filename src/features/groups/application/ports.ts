import { Context, type Effect } from 'effect'
import type { NotFoundError } from '@/shared/domain/errors'
import type { Page, PageParams } from '@/shared/domain/pagination'
import type { Group } from '../domain/group'

export type { Group }

/** Port: a choir's groups (voices, sections…), always scoped by organization. */
export class GroupRepository extends Context.Tag('GroupRepository')<
  GroupRepository,
  {
    readonly list: (orgId: string) => Effect.Effect<Array<Group>>
    readonly search: (orgId: string, params: PageParams) => Effect.Effect<Page<Group>>
    readonly create: (orgId: string, group: { name: string; slug: string }) => Effect.Effect<Group>
    readonly remove: (orgId: string, groupId: string) => Effect.Effect<void, NotFoundError>
    /** Which of `groupIds` exist in this organization. */
    readonly existingIds: (orgId: string, groupIds: ReadonlyArray<string>) => Effect.Effect<Array<string>>
  }
>() {}
