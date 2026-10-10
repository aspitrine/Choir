import { Effect, Layer } from 'effect'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { NotFoundError } from '@/shared/domain/errors'
import { group } from '@/features/groups/infrastructure/schema'
import { playlist, playlistItem } from '@/features/playlists/infrastructure/schema'
import { asset, assetGroup, song } from '@/features/songs/infrastructure/schema'
import { ShareLinkRepository } from '../application/ports'
import { shareLink, shareLinkGroup } from './schema'

export const DrizzleShareLinkRepository = Layer.effect(
  ShareLinkRepository,
  Effect.map(Database, (db) => ({
    listForPlaylist: (playlistId) =>
      Effect.promise(async () => {
        const links = await db.select().from(shareLink).where(eq(shareLink.playlistId, playlistId))
        const ids = links.map((l) => l.id)
        const groupRows =
          ids.length > 0
            ? await db
                .select({ shareLinkId: shareLinkGroup.shareLinkId, group })
                .from(shareLinkGroup)
                .innerJoin(group, eq(group.id, shareLinkGroup.groupId))
                .where(inArray(shareLinkGroup.shareLinkId, ids))
            : []
        return links.map((link) => ({
          link,
          groups: groupRows.filter((g) => g.shareLinkId === link.id).map((g) => g.group),
        }))
      }),

    create: (playlistId, groupIds) =>
      Effect.promise(async () => {
        const [created] = await db
          .insert(shareLink)
          .values({ id: crypto.randomUUID(), playlistId, token: crypto.randomUUID() })
          .returning()
        if (groupIds.length > 0) {
          await db.insert(shareLinkGroup).values(groupIds.map((groupId) => ({ shareLinkId: created!.id, groupId })))
        }
        return created!
      }),

    findOwned: (orgId, shareLinkId) =>
      Effect.promise(() =>
        db
          .select({ link: shareLink })
          .from(shareLink)
          .innerJoin(playlist, eq(playlist.id, shareLink.playlistId))
          .where(and(eq(shareLink.id, shareLinkId), eq(playlist.organizationId, orgId)))
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row.link) : Effect.fail(new NotFoundError({ entity: 'shareLink', id: shareLinkId })),
        ),
      ),

    revoke: (shareLinkId, at) =>
      Effect.promise(() => db.update(shareLink).set({ revokedAt: at }).where(eq(shareLink.id, shareLinkId))).pipe(
        Effect.asVoid,
      ),

    findByToken: (token) =>
      Effect.promise(async () => {
        const [link] = await db.select().from(shareLink).where(eq(shareLink.token, token)).limit(1)
        if (!link) return null
        const rows = await db
          .select({ groupId: shareLinkGroup.groupId })
          .from(shareLinkGroup)
          .where(eq(shareLinkGroup.shareLinkId, link.id))
        return { link, groupIds: rows.map((r) => r.groupId) }
      }),

    loadContent: (playlistId) =>
      Effect.promise(async () => {
        const [playlistRow] = await db
          .select({ name: playlist.name, description: playlist.description })
          .from(playlist)
          .where(eq(playlist.id, playlistId))
        const songs = await db
          .select({
            id: song.id,
            title: song.title,
            composer: song.composer,
            arranger: song.arranger,
            key: song.key,
            tempo: song.tempo,
          })
          .from(playlistItem)
          .innerJoin(song, eq(song.id, playlistItem.songId))
          .where(eq(playlistItem.playlistId, playlistId))
          .orderBy(asc(playlistItem.position))
        const songIds = songs.map((s) => s.id)
        const assets =
          songIds.length > 0
            ? await db
                .select()
                .from(asset)
                // Uploads still in flight (or failed) have no object to serve.
                .where(and(inArray(asset.songId, songIds), eq(asset.status, 'ready')))
                // Stable across refetches: the playlist player lists tracks in this order.
                .orderBy(asc(asset.createdAt), asc(asset.id))
            : []
        const tags =
          assets.length > 0
            ? await db
                .select({ assetId: assetGroup.assetId, id: group.id, name: group.name })
                .from(assetGroup)
                .innerJoin(group, eq(group.id, assetGroup.groupId))
                .where(
                  inArray(
                    assetGroup.assetId,
                    assets.map((a) => a.id),
                  ),
                )
                .orderBy(asc(group.name))
            : []
        return {
          playlist: playlistRow!,
          songs,
          assets: assets.map((a) => ({
            ...a,
            groups: tags.filter((t) => t.assetId === a.id).map(({ id, name }) => ({ id, name })),
          })),
        }
      }),
  })),
)
