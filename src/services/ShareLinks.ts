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
import { requireOrgGroups } from './orgGroups'

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
      groupIds: ReadonlyArray<string>,
    ) => Effect.Effect<typeof shareLink.$inferSelect, NotFoundError>
    readonly revoke: (orgId: string, shareLinkId: string) => Effect.Effect<void, NotFoundError>
    /**
     * Everything an anonymous visitor may see through a share link — and nothing
     * more: no private song notes, organization ids or import provenance.
     */
    readonly resolvePublic: (token: string) => Effect.Effect<
      {
        playlist: Pick<typeof playlist.$inferSelect, 'name' | 'description'>
        items: Array<{
          song: Pick<typeof song.$inferSelect, 'id' | 'title' | 'composer' | 'arranger' | 'key' | 'tempo'>
          assets: Array<
            typeof asset.$inferSelect & { groups: Array<Pick<typeof group.$inferSelect, 'id' | 'name'>> }
          >
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
          const linkIds = links.map(({ link }) => link.id)
          const groupRows =
            linkIds.length > 0
              ? await db
                  .select({ shareLinkId: shareLinkGroup.shareLinkId, group })
                  .from(shareLinkGroup)
                  .innerJoin(group, eq(group.id, shareLinkGroup.groupId))
                  .where(inArray(shareLinkGroup.shareLinkId, linkIds))
              : []
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
          Effect.flatMap(() => requireOrgGroups(db, orgId, groupIds)),
          Effect.flatMap((ids) =>
            Effect.promise(async () => {
              const [created] = await db
                .insert(shareLink)
                .values({ id: crypto.randomUUID(), playlistId, token: crypto.randomUUID() })
                .returning()
              if (ids.length > 0) {
                await db
                  .insert(shareLinkGroup)
                  .values(ids.map((groupId) => ({ shareLinkId: created!.id, groupId })))
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
                .select({
                  itemId: playlistItem.id,
                  position: playlistItem.position,
                  song: {
                    id: song.id,
                    title: song.title,
                    composer: song.composer,
                    arranger: song.arranger,
                    key: song.key,
                    tempo: song.tempo,
                  },
                })
                .from(playlistItem)
                .innerJoin(song, eq(song.id, playlistItem.songId))
                .where(eq(playlistItem.playlistId, link.playlistId))
                .orderBy(asc(playlistItem.position))

              const songIds = items.map((i) => i.song.id)
              const allAssets =
                songIds.length > 0
                  ? await db
                      .select()
                      .from(asset)
                      // Uploads still in flight (or failed) have no object to serve.
                      .where(and(inArray(asset.songId, songIds), eq(asset.status, 'ready')))
                  : []

              let visibleAssetIds: Set<string>
              if (filterGroupIds.length === 0 || allAssets.length === 0) {
                visibleAssetIds = new Set(allAssets.map((a) => a.id))
              } else {
                // Tags of this playlist's assets only: an asset is visible when
                // untagged or tagged with one of the link's groups.
                const tagRows = await db
                  .select({ assetId: assetGroup.assetId, groupId: assetGroup.groupId })
                  .from(assetGroup)
                  .where(
                    inArray(
                      assetGroup.assetId,
                      allAssets.map((a) => a.id),
                    ),
                  )
                const anyTaggedAssetIds = new Set(tagRows.map((r) => r.assetId))
                const filter = new Set(filterGroupIds)
                const taggedAssetIds = new Set(
                  tagRows.filter((r) => filter.has(r.groupId)).map((r) => r.assetId),
                )
                visibleAssetIds = new Set(
                  allAssets
                    .filter((a) => !anyTaggedAssetIds.has(a.id) || taggedAssetIds.has(a.id))
                    .map((a) => a.id),
                )
              }

              // Group tags of each visible asset, so the share page can bundle
              // files by exactly whom they were shared with.
              const tagRows =
                visibleAssetIds.size > 0
                  ? await db
                      .select({ assetId: assetGroup.assetId, id: group.id, name: group.name })
                      .from(assetGroup)
                      .innerJoin(group, eq(group.id, assetGroup.groupId))
                      .where(inArray(assetGroup.assetId, [...visibleAssetIds]))
                      .orderBy(asc(group.name))
                  : []

              return {
                playlist: { name: playlistRow!.name, description: playlistRow!.description },
                items: items.map((i) => ({
                  song: i.song,
                  assets: allAssets
                    .filter((a) => a.songId === i.song.id && visibleAssetIds.has(a.id))
                    .map((a) => ({
                      ...a,
                      groups: tagRows.filter((t) => t.assetId === a.id).map(({ id, name }) => ({ id, name })),
                    })),
                })),
              }
            })
          }),
        ),
    }
  }),
)
