import { Effect } from 'effect'
import { ValidationError } from '@/shared/domain/errors'
import { requireManager } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import { SongRepository } from '@/features/songs/application/ports'
import { isPermutationOf } from '../domain/ordering'
import type { CreatePlaylistInput } from '../domain/playlist'
import { selectUpcoming } from '../domain/upcoming'
import { PlaylistRepository } from './ports'

// Every operation on a playlist starts by proving it belongs to the actor's choir.
const ownedPlaylist = (actor: Actor, playlistId: string) =>
  Effect.flatMap(PlaylistRepository, (playlists) => playlists.get(actor.orgId, playlistId))

/** Same, plus the manager role, for writes. */
const managedPlaylist = (actor: Actor, playlistId: string) =>
  requireManager(actor).pipe(Effect.zipRight(ownedPlaylist(actor, playlistId)))

export const listPlaylists = (actor: Actor) =>
  Effect.flatMap(PlaylistRepository, (playlists) => playlists.list(actor.orgId))

export const getPlaylistDetail = (actor: Actor, playlistId: string) =>
  Effect.gen(function* () {
    const playlists = yield* PlaylistRepository
    const playlist = yield* ownedPlaylist(actor, playlistId)
    const [items, eventDates] = yield* Effect.all([
      playlists.listItems(playlistId),
      playlists.listEventDates(playlistId),
    ])
    return { playlist, items, eventDates }
  })

export const listUpcomingPlaylists = (actor: Actor) =>
  Effect.gen(function* () {
    const playlists = yield* PlaylistRepository
    const { playlists: all, dates } = yield* playlists.listWithEventDates(actor.orgId)
    return selectUpcoming(all, dates, new Date())
  })

export const createPlaylist = (actor: Actor, input: CreatePlaylistInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const playlists = yield* PlaylistRepository
    return yield* playlists.create(actor.orgId, input)
  })

export const deletePlaylist = (actor: Actor, playlistId: string) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.remove(playlistId))
  })

/** The song must belong to the same choir: a share link would otherwise expose another choir's files. */
export const addSongToPlaylist = (actor: Actor, playlistId: string, songId: string) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    const songs = yield* SongRepository
    yield* songs.get(actor.orgId, songId)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.appendSong(playlistId, songId))
  })

export const removePlaylistItem = (actor: Actor, playlistId: string, itemId: string) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.removeItem(playlistId, itemId))
  })

export const reorderPlaylist = (actor: Actor, playlistId: string, itemIdsInOrder: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    const playlists = yield* PlaylistRepository
    if (!isPermutationOf(itemIdsInOrder, yield* playlists.itemIds(playlistId))) {
      return yield* Effect.fail(new ValidationError({ message: 'La playlist a changé, rechargez la page' }))
    }
    yield* playlists.reorder(playlistId, itemIdsInOrder)
  })

export const addEventDate = (actor: Actor, playlistId: string, eventDate: Date) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.addEventDate(playlistId, eventDate))
  })

export const removeEventDate = (actor: Actor, playlistId: string, eventDateId: string) =>
  Effect.gen(function* () {
    yield* managedPlaylist(actor, playlistId)
    yield* Effect.flatMap(PlaylistRepository, (playlists) => playlists.removeEventDate(playlistId, eventDateId))
  })
