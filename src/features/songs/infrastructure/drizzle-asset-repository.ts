import { Effect, Layer } from 'effect'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { NotFoundError } from '@/shared/domain/errors'
import { group } from '@/features/groups/infrastructure/schema'
import { AssetRepository } from '../application/ports'
import { asset, assetGroup, song } from './schema'

export const DrizzleAssetRepository = Layer.effect(
  AssetRepository,
  Effect.map(Database, (db) => ({
    listForSong: (songId) => Effect.promise(() => db.select().from(asset).where(eq(asset.songId, songId))),

    groupsForSong: (songId) =>
      Effect.promise(() =>
        db
          .select({ assetId: assetGroup.assetId, group })
          .from(assetGroup)
          .innerJoin(asset, eq(asset.id, assetGroup.assetId))
          .innerJoin(group, eq(group.id, assetGroup.groupId))
          .where(eq(asset.songId, songId)),
      ),

    findOwned: (orgId, assetId) =>
      Effect.promise(() =>
        db
          .select({ asset })
          .from(asset)
          .innerJoin(song, eq(asset.songId, song.id))
          .where(and(eq(asset.id, assetId), eq(song.organizationId, orgId)))
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row.asset) : Effect.fail(new NotFoundError({ entity: 'asset', id: assetId })),
        ),
      ),

    insertPending: (pending, groupIds) =>
      Effect.promise(async () => {
        await db.insert(asset).values({ ...pending, status: 'uploading' })
        if (groupIds.length > 0) {
          await db.insert(assetGroup).values(groupIds.map((groupId) => ({ assetId: pending.id, groupId })))
        }
      }),

    markReady: (assetId, { sizeBytes, mimeType }) =>
      Effect.promise(() =>
        db.update(asset).set({ status: 'ready', sizeBytes, mimeType }).where(eq(asset.id, assetId)).returning(),
      ).pipe(Effect.map(([row]) => row!)),

    remove: (assetId) => Effect.promise(() => db.delete(asset).where(eq(asset.id, assetId))).pipe(Effect.asVoid),

    removeMany: (assetIds) =>
      assetIds.length === 0
        ? Effect.void
        : Effect.promise(() => db.delete(asset).where(inArray(asset.id, [...assetIds]))).pipe(Effect.asVoid),

    removeForSong: (songId) =>
      Effect.promise(() => db.delete(asset).where(eq(asset.songId, songId))).pipe(Effect.asVoid),

    replaceGroups: (assetId, groupIds) =>
      Effect.promise(async () => {
        await db.delete(assetGroup).where(eq(assetGroup.assetId, assetId))
        if (groupIds.length > 0) {
          await db.insert(assetGroup).values(groupIds.map((groupId) => ({ assetId, groupId })))
        }
      }),

    storageKeysForSong: (songId) =>
      Effect.promise(() => db.select({ storageKey: asset.storageKey }).from(asset).where(eq(asset.songId, songId))).pipe(
        Effect.map((rows) => rows.map((r) => r.storageKey)),
      ),

    storageKeysForOrg: (orgId) =>
      Effect.promise(() =>
        db
          .select({ storageKey: asset.storageKey })
          .from(asset)
          .innerJoin(song, eq(asset.songId, song.id))
          .where(eq(song.organizationId, orgId)),
      ).pipe(Effect.map((rows) => rows.map((r) => r.storageKey))),

    findStaleUploads: (orgId, olderThan) =>
      Effect.promise(() =>
        db
          .select({ id: asset.id, storageKey: asset.storageKey })
          .from(asset)
          .innerJoin(song, eq(asset.songId, song.id))
          .where(and(eq(song.organizationId, orgId), eq(asset.status, 'uploading'), lt(asset.createdAt, olderThan))),
      ),
  })),
)
