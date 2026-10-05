import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect } from 'effect'
import { AuthService } from '../services/Auth'
import { Playlists } from '../services/Playlists'
import { Access } from '../services/Access'
import { AppRuntime } from '../services/Runtime'
import { AddEventDateInput, ByPlaylist, CreatePlaylistInput, PlaylistItemInput, PlaylistSongInput, RemoveEventDateInput, ReorderPlaylistInput, decodeInput } from '../domain/inputs'

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
  .validator(decodeInput(ByPlaylist))
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
  .validator(decodeInput(CreatePlaylistInput))
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
  .validator(decodeInput(ByPlaylist))
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
  .validator(decodeInput(PlaylistSongInput))
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
  .validator(decodeInput(PlaylistItemInput))
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
  .validator(decodeInput(ReorderPlaylistInput))
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
  .validator(decodeInput(AddEventDateInput))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const playlists = yield* Playlists
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* playlists.addEventDate(orgId, data.playlistId, data.eventDate)
      }),
    ),
  )

export const removeEventDateFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(RemoveEventDateInput))
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
