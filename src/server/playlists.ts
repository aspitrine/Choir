import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { AuthService } from '../services/Auth'
import { Playlists } from '../services/Playlists'
import { Access } from '../services/Access'
import { AppRuntime } from '../services/Runtime'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const listPlaylistsFn = createServerFn({ method: 'GET' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const playlists = yield* Playlists
      const { orgId } = yield* auth.requireActiveOrganizationId(headers())
      return yield* playlists.list(orgId)
    }),
  ),
)

export const getPlaylistFn = createServerFn({ method: 'GET' })
  .validator((data: { playlistId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        const pl = yield* playlists.get(orgId, data.playlistId)
        const items = yield* playlists.listItems(orgId, data.playlistId)
        const eventDates = yield* playlists.listEventDates(orgId, data.playlistId)
        return { playlist: pl, items, eventDates }
      }),
    ),
  )

export const createPlaylistFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; description: string | null }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* playlists.create(orgId, data.name, data.description)
      }),
    ),
  )

export const deletePlaylistFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.remove(orgId, data.playlistId)
      }),
    ),
  )

export const addSongToPlaylistFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string; songId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.addSong(orgId, data.playlistId, data.songId)
      }),
    ),
  )

export const removePlaylistItemFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string; itemId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.removeItem(orgId, data.playlistId, data.itemId)
      }),
    ),
  )

export const reorderPlaylistFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string; itemIdsInOrder: Array<string> }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.reorder(orgId, data.playlistId, data.itemIdsInOrder)
      }),
    ),
  )

export const addEventDateFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string; eventDate: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.addEventDate(orgId, data.playlistId, new Date(data.eventDate))
      }),
    ),
  )

export const removeEventDateFn = createServerFn({ method: 'POST' })
  .validator((data: { playlistId: string; eventDateId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.removeEventDate(orgId, data.playlistId, data.eventDateId)
      }),
    ),
  )

export const listUpcomingPlaylistsFn = createServerFn({ method: 'GET' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const playlists = yield* Playlists
      const { orgId } = yield* auth.requireActiveOrganizationId(headers())
      return yield* playlists.listUpcoming(orgId)
    }),
  ),
)
