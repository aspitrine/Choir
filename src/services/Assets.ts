import { Context, Effect, Layer } from 'effect'
import { eq, and } from 'drizzle-orm'
import { Database } from './Database'
import { Storage } from './Storage'
import { song, asset, assetGroup, group } from '../db/schema'
import { NotFoundError, StorageError } from '../domain/errors'
import type { CreateUploadIntentInput } from '../domain/songs'

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
      groupIds: Array<string>,
    ) => Effect.Effect<void, NotFoundError>
    /** Group tags for every asset of a song, in one query — for list/detail views. */
    readonly listGroupsForSong: (
      songId: string,
    ) => Effect.Effect<Array<{ assetId: string; group: typeof group.$inferSelect }>>
  }
>() {}

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

    const setGroups = (orgId: string, assetId: string, groupIds: Array<string>) =>
      getOwnedAsset(orgId, assetId).pipe(
        Effect.flatMap(() =>
          Effect.promise(async () => {
            await db.delete(assetGroup).where(eq(assetGroup.assetId, assetId))
            if (groupIds.length > 0) {
              await db.insert(assetGroup).values(
                groupIds.map((groupId) => ({ assetId, groupId })),
              )
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
          Effect.flatMap(() => {
            const assetId = crypto.randomUUID()
            const storageKey = `org/${orgId}/song/${input.songId}/${assetId}-${input.filename}`
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
                input.groupIds.length > 0
                  ? Effect.promise(() =>
                      db.insert(assetGroup).values(
                        input.groupIds.map((groupId) => ({ assetId, groupId })),
                      ),
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
    }
  }),
)
