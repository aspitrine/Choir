import { Effect } from 'effect'
import { FileStorage, removeObjects } from '@/shared/application/file-storage'
import { requireManager } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { requireOrgGroups } from '@/features/groups/application/groups'
import { STALE_UPLOAD_MS, storageKeyFor } from '../domain/asset'
import type { CreateUploadIntentInput } from '../domain/song'
import { AssetRepository, SongRepository } from './ports'

/**
 * Deletes assets of the organization stuck in "uploading" since before
 * `olderThan` (tab closed mid-transfer…), with whatever object may exist.
 */
export const purgeStaleUploads = (orgId: string, olderThan: Date) =>
  Effect.gen(function* () {
    const assets = yield* AssetRepository
    const stale = yield* assets.findStaleUploads(orgId, olderThan)
    if (stale.length === 0) return 0
    yield* assets.removeMany(stale.map((a) => a.id))
    yield* removeObjects(stale.map((a) => a.storageKey))
    return stale.length
  })

/** Reserves an asset and returns where the client must PUT the bytes. */
export const createUploadIntent = (actor: Actor, input: CreateUploadIntentInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const songs = yield* SongRepository
    const assets = yield* AssetRepository
    const storage = yield* FileStorage
    yield* songs.get(actor.orgId, input.songId)
    const groupIds = yield* requireOrgGroups(actor.orgId, input.groupIds)
    // Opportunistic cleanup of transfers abandoned more than a day ago.
    yield* purgeStaleUploads(actor.orgId, new Date(Date.now() - STALE_UPLOAD_MS))

    const assetId = crypto.randomUUID()
    const storageKey = storageKeyFor(actor.orgId, input.songId, assetId, input.filename)
    const uploadUrl = yield* storage.presignPut(storageKey, input.contentType)
    yield* assets.insertPending(
      { id: assetId, songId: input.songId, kind: input.kind, label: input.label, storageKey, mimeType: input.contentType },
      groupIds,
    )
    return { assetId, uploadUrl }
  })

/** Marks an upload as ready, with the size and type storage actually holds. */
export const confirmUpload = (actor: Actor, assetId: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const assets = yield* AssetRepository
    const storage = yield* FileStorage
    const asset = yield* assets.findOwned(actor.orgId, assetId)
    const meta = yield* storage.head(asset.storageKey)
    return yield* assets.markReady(assetId, { sizeBytes: meta.sizeBytes, mimeType: meta.contentType })
  })

/** Object first, so a storage failure leaves the row to retry from. */
export const deleteAsset = (actor: Actor, assetId: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const assets = yield* AssetRepository
    const storage = yield* FileStorage
    const asset = yield* assets.findOwned(actor.orgId, assetId)
    yield* storage.remove(asset.storageKey)
    yield* assets.remove(assetId)
  })

export const setAssetGroups = (actor: Actor, assetId: string, groupIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const assets = yield* AssetRepository
    yield* assets.findOwned(actor.orgId, assetId)
    const ids = yield* requireOrgGroups(actor.orgId, groupIds)
    yield* assets.replaceGroups(assetId, ids)
  })
