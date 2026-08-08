import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Songs } from '../services/Songs'
import { Assets } from '../services/Assets'
import { Access } from '../services/Access'
import { Storage } from '../services/Storage'
import { AppRuntime } from '../services/Runtime'
import { CreateSongInput, UpdateSongInput } from '../domain/songs'
import { PageParams } from '../domain/pagination'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const listSongsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Schema.decodeUnknownSync(PageParams)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const songs = yield* Songs
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        return yield* songs.list(orgId, data)
      }),
    ),
  )

export const listAllSongsFn = createServerFn({ method: 'GET' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const songs = yield* Songs
      const { orgId } = yield* auth.requireActiveOrganizationId(headers())
      return yield* songs.listAll(orgId)
    }),
  ),
)

export const getSongFn = createServerFn({ method: 'GET' })
  .validator((data: { songId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const songs = yield* Songs
        const assets = yield* Assets
        const storage = yield* Storage
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        const song = yield* songs.get(orgId, data.songId)
        const assetList = yield* songs.listAssets(orgId, data.songId)
        const groupsByAsset = yield* assets.listGroupsForSong(data.songId)
        const assetsWithDetails = yield* Effect.all(
          assetList.map((a) =>
            Effect.gen(function* () {
              const url = a.status === 'ready' ? yield* storage.presignGet(a.storageKey) : null
              return {
                ...a,
                url,
                groups: groupsByAsset.filter((g) => g.assetId === a.id).map((g) => g.group),
              }
            }),
          ),
        )
        return { song, assets: assetsWithDetails }
      }),
    ),
  )

export const createSongFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => Schema.decodeUnknownSync(CreateSongInput)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const songs = yield* Songs
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* songs.create(orgId, data)
      }),
    ),
  )

export const updateSongFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => Schema.decodeUnknownSync(UpdateSongInput)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const songs = yield* Songs
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* songs.update(orgId, data.songId, data)
      }),
    ),
  )

export const deleteSongFn = createServerFn({ method: 'POST' })
  .validator((data: { songId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const songs = yield* Songs
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* songs.remove(orgId, data.songId)
      }),
    ),
  )
