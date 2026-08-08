import { Context, Effect, Layer } from 'effect'
import { eq, and, asc, inArray } from 'drizzle-orm'
import { Database } from './Database'
import {
  shareLink,
  shareLinkGroup,
  group,
  playlist,
  playlistItem,
  song,
  asset,
  assetGroup,
} from '../db/schema'
import { NotFoundError } from '../domain/errors'

export class ShareLinks extends Context.Tag('ShareLinks')<
  ShareLinks,
  {
    readonly list: (
      orgId: string,
      playlistId: string,
    ) => Effect.Effect<
      Array<{ link: typeof shareLink.$inferSelect; groups: Array<typeof group.$inferSelect> }>
    >
    readonly create: (
      orgId: string,
      playlistId: string,
      groupIds: Array<string>,
    ) => Effect.Effect<typeof shareLink.$inferSelect, NotFoundError>
    readonly revoke: (orgId: string, shareLinkId: string) => Effect.Effect<void, NotFoundError>
    readonly resolvePublic: (token: string) => Effect.Effect<
      {
        playlist: typeof playlist.$inferSelect
        items: Array<{
          song: typeof song.$inferSelect
          assets: Array<typeof asset.$inferSelect>
        }>
      },
      NotFoundError
    >
  }
>() {}

export const ShareLinksLive = Layer.effect(
  ShareLinks,
  Effect.gen(function* () {
    const db = yield* Database

    return {
      list: (orgId, playlistId) =>
        Effect.promise(async () => {
          const links = await db
            .select({ link: shareLink })
            .from(shareLink)
            .innerJoin(playlist, eq(playlist.id, shareLink.playlistId))
            .where(and(eq(shareLink.playlistId, playlistId), eq(playlist.organizationId, orgId)))
          const groupRows = await db
            .select({ shareLinkId: shareLinkGroup.shareLinkId, group })
            .from(shareLinkGroup)
            .innerJoin(group, eq(group.id, shareLinkGroup.groupId))
          return links.map(({ link }) => ({
            link,
            groups: groupRows.filter((g) => g.shareLinkId === link.id).map((g) => g.group),
          }))
        }),

      create: (orgId, playlistId, groupIds) =>
        Effect.promise(() =>
          db
            .select({ id: playlist.id })
            .from(playlist)
            .where(and(eq(playlist.id, playlistId), eq(playlist.organizationId, orgId)))
            .limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: 'playlist', id: playlistId })),
          ),
          Effect.flatMap(() =>
            Effect.promise(async () => {
              const [created] = await db
                .insert(shareLink)
                .values({ id: crypto.randomUUID(), playlistId, token: crypto.randomUUID() })
                .returning()
              if (groupIds.length > 0) {
                await db
                  .insert(shareLinkGroup)
                  .values(groupIds.map((groupId) => ({ shareLinkId: created!.id, groupId })))
              }
              return created!
            }),
          ),
        ),

      revoke: (orgId, shareLinkId) =>
        Effect.promise(() =>
          db
            .select({ id: shareLink.id })
            .from(shareLink)
            .innerJoin(playlist, eq(playlist.id, shareLink.playlistId))
            .where(and(eq(shareLink.id, shareLinkId), eq(playlist.organizationId, orgId)))
            .limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row
              ? Effect.promise(() =>
                  db.update(shareLink).set({ revokedAt: new Date() }).where(eq(shareLink.id, shareLinkId)),
                ).pipe(Effect.asVoid)
              : Effect.fail(new NotFoundError({ entity: 'shareLink', id: shareLinkId })),
          ),
        ),

      resolvePublic: (token) =>
        Effect.promise(() =>
          db.select().from(shareLink).where(eq(shareLink.token, token)).limit(1),
        ).pipe(
          Effect.flatMap(([link]) => {
            if (!link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
              return Effect.fail(new NotFoundError({ entity: 'shareLink', id: token }))
            }
            return Effect.promise(async () => {
              const [playlistRow] = await db.select().from(playlist).where(eq(playlist.id, link.playlistId))

              const filterGroupIds = (
                await db
                  .select({ groupId: shareLinkGroup.groupId })
                  .from(shareLinkGroup)
                  .where(eq(shareLinkGroup.shareLinkId, link.id))
              ).map((r) => r.groupId)

              const items = await db
                .select({ itemId: playlistItem.id, position: playlistItem.position, song })
                .from(playlistItem)
                .innerJoin(song, eq(song.id, playlistItem.songId))
                .where(eq(playlistItem.playlistId, link.playlistId))
                .orderBy(asc(playlistItem.position))

              const songIds = items.map((i) => i.song.id)
              const allAssets =
                songIds.length > 0
                  ? await db.select().from(asset).where(inArray(asset.songId, songIds))
                  : []

              let visibleAssetIds: Set<string>
              if (filterGroupIds.length === 0) {
                visibleAssetIds = new Set(allAssets.map((a) => a.id))
              } else {
                const taggedAssetIds = new Set(
                  (
                    await db
                      .select({ assetId: assetGroup.assetId })
                      .from(assetGroup)
                      .where(inArray(assetGroup.groupId, filterGroupIds))
                  ).map((r) => r.assetId),
                )
                const anyTagRows = await db
                  .select({ assetId: assetGroup.assetId })
                  .from(assetGroup)
                const anyTaggedAssetIds = new Set(anyTagRows.map((r) => r.assetId))
                visibleAssetIds = new Set(
                  allAssets
                    .filter((a) => !anyTaggedAssetIds.has(a.id) || taggedAssetIds.has(a.id))
                    .map((a) => a.id),
                )
              }

              return {
                playlist: playlistRow!,
                items: items.map((i) => ({
                  song: i.song,
                  assets: allAssets.filter((a) => a.songId === i.song.id && visibleAssetIds.has(a.id)),
                })),
              }
            })
          }),
        ),
    }
  }),
)
