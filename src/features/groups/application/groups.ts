import { Effect } from 'effect'
import { NotFoundError } from '@/shared/domain/errors'
import type { PageParams } from '@/shared/domain/pagination'
import { requireManager } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { slugify } from '../domain/group'
import { GroupRepository } from './ports'

export const listGroups = (actor: Actor) => Effect.flatMap(GroupRepository, (groups) => groups.list(actor.orgId))

export const searchGroups = (actor: Actor, params: PageParams) =>
  Effect.flatMap(GroupRepository, (groups) => groups.search(actor.orgId, params))

export const createGroup = (actor: Actor, name: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const groups = yield* GroupRepository
    // Random suffix: two groups may share a display name.
    return yield* groups.create(actor.orgId, { name, slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}` })
  })

export const deleteGroup = (actor: Actor, groupId: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const groups = yield* GroupRepository
    yield* groups.remove(actor.orgId, groupId)
  })

/**
 * Group ids come from the client: make sure every one belongs to the organization
 * before tagging anything with it (otherwise another choir's group could be
 * attached — and its name shown on public share pages). Returns them deduplicated.
 */
export const requireOrgGroups = (orgId: string, groupIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const unique = [...new Set(groupIds)]
    if (unique.length === 0) return unique
    const groups = yield* GroupRepository
    const found = new Set(yield* groups.existingIds(orgId, unique))
    const missing = unique.filter((id) => !found.has(id))
    if (missing.length > 0) return yield* Effect.fail(new NotFoundError({ entity: 'group', id: missing.join(',') }))
    return unique
  })
