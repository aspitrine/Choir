import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { PageParams } from '@/shared/domain/pagination'
import { Id } from '@/shared/domain/schemas'
import { decodeInput } from '@/shared/server/request'
import { withActor } from '@/app/runtime'
import { CreateGroupInput } from '../domain/group'
import { createGroup, deleteGroup, listGroups, searchGroups } from '../application/groups'

export const listGroupsFn = createServerFn({ method: 'GET' }).handler(() => withActor(listGroups))

export const searchGroupsFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(PageParams))
  .handler(({ data }) => withActor((actor) => searchGroups(actor, data)))

export const createGroupFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreateGroupInput))
  .handler(({ data }) => withActor((actor) => createGroup(actor, data.name)))

export const deleteGroupFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ groupId: Id })))
  .handler(({ data }) => withActor((actor) => deleteGroup(actor, data.groupId)))
