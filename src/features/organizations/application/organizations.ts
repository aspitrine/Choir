import { Effect } from 'effect'
import { removeObjects } from '@/shared/application/file-storage'
import { requireOwner } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { AssetRepository } from '@/features/songs/application/ports'
import { OrganizationAuthority } from './ports'

/**
 * Wipes the whole choir. Every domain table cascades from the organization row;
 * stored files don't, so their keys are read first and the objects removed only
 * once the organization is gone — if the deletion is refused, nothing is lost.
 */
export const deleteOrganization = (actor: Actor) =>
  Effect.gen(function* () {
    yield* requireOwner(actor)
    const assets = yield* AssetRepository
    const authority = yield* OrganizationAuthority
    const keys = yield* assets.storageKeysForOrg(actor.orgId)
    yield* authority.deleteOrganization(actor.orgId)
    yield* removeObjects(keys)
  })
