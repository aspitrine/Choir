import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { AuthService } from '../services/Auth'
import { ShareLinks } from '../services/ShareLinks'
import { Access } from '../services/Access'
import { Storage } from '../services/Storage'
import { AppRuntime } from '../services/Runtime'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const listShareLinksFn = createServerFn({ method: 'GET' })
  .validator((data: { playlistId: string }) => data)
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
  .validator((data: { playlistId: string; groupIds: Array<string> }) => data)
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
  .validator((data: { shareLinkId: string }) => data)
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
  .validator((data: { token: string }) => data)
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
