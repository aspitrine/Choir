import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { Id } from '@/shared/domain/schemas'
import { decodeInput } from '@/shared/server/request'
import { withActor } from '@/app/runtime'
import { CreatePlaylistInput } from '../domain/playlist'
import {
  addEventDate,
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistDetail,
  listPlaylists,
  listUpcomingPlaylists,
  removeEventDate,
  removePlaylistItem,
  reorderPlaylist,
} from '../application/playlists'

const ByPlaylist = Schema.Struct({ playlistId: Id })

export const listPlaylistsFn = createServerFn({ method: 'GET' }).handler(() => withActor(listPlaylists))

export const listUpcomingPlaylistsFn = createServerFn({ method: 'GET' }).handler(() => withActor(listUpcomingPlaylists))

export const getPlaylistFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(ByPlaylist))
  .handler(({ data }) => withActor((actor) => getPlaylistDetail(actor, data.playlistId)))

export const createPlaylistFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreatePlaylistInput))
  .handler(({ data }) => withActor((actor) => createPlaylist(actor, data)))

export const deletePlaylistFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByPlaylist))
  .handler(({ data }) => withActor((actor) => deletePlaylist(actor, data.playlistId)))

export const addSongToPlaylistFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id, songId: Id })))
  .handler(({ data }) => withActor((actor) => addSongToPlaylist(actor, data.playlistId, data.songId)))

export const removePlaylistItemFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id, itemId: Id })))
  .handler(({ data }) => withActor((actor) => removePlaylistItem(actor, data.playlistId, data.itemId)))

export const reorderPlaylistFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id, itemIdsInOrder: Schema.Array(Id).pipe(Schema.maxItems(1000)) })))
  .handler(({ data }) => withActor((actor) => reorderPlaylist(actor, data.playlistId, data.itemIdsInOrder)))

export const addEventDateFn = createServerFn({ method: 'POST' })
  // Schema.Date rejects strings that don't parse to a real date.
  .validator(decodeInput(Schema.Struct({ playlistId: Id, eventDate: Schema.Date })))
  .handler(({ data }) => withActor((actor) => addEventDate(actor, data.playlistId, data.eventDate)))

export const removeEventDateFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ playlistId: Id, eventDateId: Id })))
  .handler(({ data }) => withActor((actor) => removeEventDate(actor, data.playlistId, data.eventDateId)))
