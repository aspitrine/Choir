import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { AuthService } from '../services/Auth'
import { ShareLinks } from '../services/ShareLinks'
import { Access } from '../services/Access'
import { Storage } from '../services/Storage'
import { AppRuntime } from '../services/Runtime'
import { ByPlaylist, ByShareLink, CreateShareLinkInput, PublicAssetUrls, PublicToken, decodeInput } from '../domain/inputs'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const listShareLinksFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(ByPlaylist))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const shareLinks = yield* ShareLinks
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        return yield* shareLinks.list(orgId, data.playlistId)
      }),
    ),
  )

export const createShareLinkFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreateShareLinkInput))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const shareLinks = yield* ShareLinks
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* shareLinks.create(orgId, data.playlistId, data.groupIds)
      }),
    ),
  )

export const revokeShareLinkFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByShareLink))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const shareLinks = yield* ShareLinks
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* shareLinks.revoke(orgId, data.shareLinkId)
      }),
    ),
  )

// Public: no auth. The token itself is the capability.
export const getPublicPlaylistFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(PublicToken))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const shareLinks = yield* ShareLinks
        const storage = yield* Storage
        const resolved = yield* shareLinks.resolvePublic(data.token)
        const items = yield* Effect.all(
          resolved.items.map((item) =>
            Effect.gen(function* () {
              const assetsWithUrls = yield* Effect.all(
                item.assets.map((a) =>
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
              )
              return { song: item.song, assets: assetsWithUrls }
            }),
          ),
        )
        return { playlist: resolved.playlist, items }
      }),
    ),
  )

// Public: fresh presigned URLs for assets visible through this token. Presigned
// URLs expire, and a looping playlist or a late PDF merge can outlive them.
export const getPublicAssetUrlsFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(PublicAssetUrls))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const shareLinks = yield* ShareLinks
        const storage = yield* Storage
        const resolved = yield* shareLinks.resolvePublic(data.token)
        const visible = new Map(
          resolved.items.flatMap((item) => item.assets).map((a) => [a.id, a.storageKey] as const),
        )
        const entries = yield* Effect.all(
          data.assetIds.flatMap((id) => {
            const key = visible.get(id)
            return key ? [storage.presignGet(key).pipe(Effect.map((url) => [id, url] as const))] : []
          }),
        )
        return Object.fromEntries(entries) as Record<string, string>
      }),
    ),
  )
