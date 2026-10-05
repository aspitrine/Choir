import { Effect } from 'effect'
import { NotFoundError } from '@/shared/domain/errors'
import { FileStorage } from '@/shared/application/file-storage'
import { requireManager } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { requireOrgGroups } from '@/features/groups/application/groups'
import { PlaylistRepository } from '@/features/playlists/application/ports'
import { isLinkActive, isVisibleThroughLink } from '../domain/share-link'
import { ShareLinkRepository } from './ports'

export const listShareLinks = (actor: Actor, playlistId: string) =>
  Effect.gen(function* () {
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.get(actor.orgId, playlistId))
    return yield* Effect.flatMap(ShareLinkRepository, (links) => links.listForPlaylist(playlistId))
  })

export const createShareLink = (actor: Actor, playlistId: string, groupIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.get(actor.orgId, playlistId))
    const ids = yield* requireOrgGroups(actor.orgId, groupIds)
    return yield* Effect.flatMap(ShareLinkRepository, (links) => links.create(playlistId, ids))
  })

export const revokeShareLink = (actor: Actor, shareLinkId: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const links = yield* ShareLinkRepository
    yield* links.findOwned(actor.orgId, shareLinkId)
    yield* links.revoke(shareLinkId, new Date())
  })

/**
 * Everything an anonymous visitor may see through a share link — and nothing
 * more: no private song notes, organization ids or unfinished uploads. The token
 * itself is the capability.
 */
export const resolvePublicPlaylist = (token: string) =>
  Effect.gen(function* () {
    const links = yield* ShareLinkRepository
    const found = yield* links.findByToken(token)
    if (!found || !isLinkActive(found.link, new Date())) {
      return yield* Effect.fail(new NotFoundError({ entity: 'shareLink', id: token }))
    }
    const { playlist, songs, assets } = yield* links.loadContent(found.link.playlistId)
    const visible = assets.filter((a) =>
      isVisibleThroughLink(
        a.groups.map((g) => g.id),
        found.groupIds,
      ),
    )
    return {
      playlist,
      items: songs.map((song) => ({ song, assets: visible.filter((a) => a.songId === song.id) })),
    }
  })

/** Public page payload, with presigned URLs instead of storage keys. */
export const getPublicPlaylist = (token: string) =>
  Effect.gen(function* () {
    const storage = yield* FileStorage
    const resolved = yield* resolvePublicPlaylist(token)
    const items = yield* Effect.all(
      resolved.items.map(({ song, assets }) =>
        Effect.all(
          assets.map((a) =>
            storage.presignGet(a.storageKey).pipe(
              Effect.map((url) => ({
                id: a.id,
                kind: a.kind,
                label: a.label,
                mimeType: a.mimeType,
                status: a.status,
                groups: a.groups,
                url,
              })),
            ),
          ),
        ).pipe(Effect.map((withUrls) => ({ song, assets: withUrls }))),
      ),
    )
    return { playlist: resolved.playlist, items }
  })

/**
 * Fresh presigned URLs for files visible through this token: they expire, and a
 * looping playlist or a late PDF merge can outlive them. Unknown ids are ignored.
 */
export const getPublicAssetUrls = (token: string, assetIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const storage = yield* FileStorage
    const resolved = yield* resolvePublicPlaylist(token)
    const visible = new Map(resolved.items.flatMap((i) => i.assets).map((a) => [a.id, a.storageKey] as const))
    const entries = yield* Effect.all(
      assetIds.flatMap((id) => {
        const key = visible.get(id)
        return key ? [storage.presignGet(key).pipe(Effect.map((url) => [id, url] as const))] : []
      }),
    )
    return Object.fromEntries(entries) as Record<string, string>
  })
