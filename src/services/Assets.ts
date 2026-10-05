import { Context, Effect, Layer } from 'effect'
import { eq, and } from 'drizzle-orm'
import { Database } from './Database'
import { Storage } from './Storage'
import { song, asset, assetGroup, group } from '../db/schema'
import { NotFoundError, StorageError } from '../domain/errors'
import type { CreateUploadIntentInput } from '../domain/songs'
import { requireOrgGroups } from './orgGroups'

export class Assets extends Context.Tag('Assets')<
  Assets,
  {
    readonly createUploadIntent: (
      orgId: string,
      input: CreateUploadIntentInput,
    ) => Effect.Effect<
      { assetId: string; uploadUrl: string },
      NotFoundError | StorageError
    >
    readonly confirmUpload: (
      orgId: string,
      assetId: string,
    ) => Effect.Effect<typeof asset.$inferSelect, NotFoundError | StorageError>
    readonly remove: (
      orgId: string,
      assetId: string,
    ) => Effect.Effect<void, NotFoundError | StorageError>
    readonly getGroups: (
      orgId: string,
      assetId: string,
    ) => Effect.Effect<Array<typeof group.$inferSelect>, NotFoundError>
    readonly setGroups: (
      orgId: string,
      assetId: string,
      groupIds: ReadonlyArray<string>,
    ) => Effect.Effect<void, NotFoundError>
    /** Group tags for every asset of a song, in one query — for list/detail views. */
    readonly listGroupsForSong: (
      songId: string,
    ) => Effect.Effect<Array<{ assetId: string; group: typeof group.$inferSelect }>>
    /**
     * Deletes every asset of a song, objects first. Run before deleting the song:
     * the DB cascade would drop the rows but leave the files in storage.
     */
    readonly removeAllForSong: (orgId: string, songId: string) => Effect.Effect<void, NotFoundError>
    /** Storage keys for every asset in the org — for cleaning up S3 objects before deleting the org. */
    readonly listStorageKeysForOrg: (orgId: string) => Effect.Effect<Array<string>>
  }
>() {}

// Keeps object keys predictable: no path segments, control or exotic characters.
export function safeFilename(filename: string) {
  const cleaned = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned || 'file'
}

export const AssetsLive = Layer.effect(
  Assets,
  Effect.gen(function* () {
    const db = yield* Database
    const storage = yield* Storage

    // Ensures the asset's song belongs to the caller's org before touching storage.
    const getOwnedAsset = (orgId: string, assetId: string) =>
      Effect.promise(() =>
        db
          .select({ asset, songOrgId: song.organizationId })
          .from(asset)
          .innerJoin(song, eq(asset.songId, song.id))
          .where(and(eq(asset.id, assetId), eq(song.organizationId, orgId)))
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row.asset) : Effect.fail(new NotFoundError({ entity: 'asset', id: assetId })),
        ),
      )

    const setGroups = (orgId: string, assetId: string, groupIds: ReadonlyArray<string>) =>
      getOwnedAsset(orgId, assetId).pipe(
        Effect.flatMap(() => requireOrgGroups(db, orgId, groupIds)),
        Effect.flatMap((ids) =>
          Effect.promise(async () => {
            await db.delete(assetGroup).where(eq(assetGroup.assetId, assetId))
            if (ids.length > 0) {
              await db.insert(assetGroup).values(ids.map((groupId) => ({ assetId, groupId })))
            }
          }),
        ),
        Effect.asVoid,
      )

    return {
      createUploadIntent: (orgId, input) =>
        Effect.promise(() =>
          db
            .select({ id: song.id })
            .from(song)
            .where(and(eq(song.id, input.songId), eq(song.organizationId, orgId)))
            .limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: 'song', id: input.songId })),
          ),
          Effect.flatMap(() => requireOrgGroups(db, orgId, input.groupIds)),
          Effect.flatMap((groupIds) => {
            const assetId = crypto.randomUUID()
            const storageKey = `org/${orgId}/song/${input.songId}/${assetId}-${safeFilename(input.filename)}`
            return storage.presignPut(storageKey, input.contentType).pipe(
              Effect.flatMap((uploadUrl) =>
                Effect.promise(() =>
                  db.insert(asset).values({
                    id: assetId,
                    songId: input.songId,
                    kind: input.kind,
                    label: input.label ?? null,
                    storageKey,
                    mimeType: input.contentType,
                    status: 'uploading',
                  }),
                ).pipe(Effect.map(() => ({ assetId, uploadUrl }))),
              ),
              Effect.tap(({ assetId }) =>
                groupIds.length > 0
                  ? Effect.promise(() =>
                      db.insert(assetGroup).values(groupIds.map((groupId) => ({ assetId, groupId }))),
                    )
                  : Effect.void,
              ),
            )
          }),
        ),
      confirmUpload: (orgId, assetId) =>
        getOwnedAsset(orgId, assetId).pipe(
          Effect.flatMap((row) =>
            storage.head(row.storageKey).pipe(
              Effect.flatMap((meta) =>
                Effect.promise(() =>
                  db
                    .update(asset)
                    .set({ status: 'ready', sizeBytes: meta.sizeBytes, mimeType: meta.contentType })
                    .where(eq(asset.id, assetId))
                    .returning(),
                ),
              ),
            ),
          ),
          Effect.map(([row]) => row!),
        ),
      remove: (orgId, assetId) =>
        getOwnedAsset(orgId, assetId).pipe(
          Effect.flatMap((row) =>
            storage
              .remove(row.storageKey)
              .pipe(
                Effect.flatMap(() =>
                  Effect.promise(() => db.delete(asset).where(eq(asset.id, assetId))),
                ),
              ),
          ),
          Effect.asVoid,
        ),
      getGroups: (orgId, assetId) =>
        getOwnedAsset(orgId, assetId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .select({
                  id: group.id,
                  organizationId: group.organizationId,
                  name: group.name,
                  slug: group.slug,
                  createdAt: group.createdAt,
                })
                .from(assetGroup)
                .innerJoin(group, eq(group.id, assetGroup.groupId))
                .where(eq(assetGroup.assetId, assetId)),
            ),
          ),
        ),
      setGroups,
      listGroupsForSong: (songId) =>
        Effect.promise(() =>
          db
            .select({ assetId: assetGroup.assetId, group })
            .from(assetGroup)
            .innerJoin(asset, eq(asset.id, assetGroup.assetId))
            .innerJoin(group, eq(group.id, assetGroup.groupId))
            .where(eq(asset.songId, songId)),
        ),
      removeAllForSong: (orgId, songId) =>
        Effect.promise(() =>
          db
            .select({ id: asset.id, storageKey: asset.storageKey, songOrgId: song.organizationId })
            .from(song)
            .leftJoin(asset, eq(asset.songId, song.id))
            .where(and(eq(song.id, songId), eq(song.organizationId, orgId))),
        ).pipe(
          Effect.flatMap((rows) =>
            rows.length === 0
              ? Effect.fail(new NotFoundError({ entity: 'song', id: songId }))
              : Effect.succeed(rows.flatMap((r) => (r.id && r.storageKey ? [r.storageKey] : []))),
          ),
          Effect.flatMap((keys) =>
            Effect.all(
              // A missing object must not block the deletion of the song.
              keys.map((key) => storage.remove(key).pipe(Effect.catchAll(() => Effect.void))),
              { concurrency: 5 },
            ),
          ),
          Effect.flatMap(() =>
            Effect.promise(() => db.delete(asset).where(eq(asset.songId, songId))),
          ),
          Effect.asVoid,
        ),
      listStorageKeysForOrg: (orgId) =>
        Effect.promise(async () => {
          const rows = await db
            .select({ storageKey: asset.storageKey })
            .from(asset)
            .innerJoin(song, eq(asset.songId, song.id))
            .where(eq(song.organizationId, orgId))
          return rows.map((r) => r.storageKey)
        }),
    }
  }),
)
