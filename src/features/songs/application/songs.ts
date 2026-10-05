import { Effect } from 'effect'
import type { PageParams } from '@/shared/domain/pagination'
import { FileStorage, removeObjects } from '@/shared/application/file-storage'
import { requireManager } from '@/features/auth/application/access'
import type { Actor } from '@/features/auth/domain/roles'
import type { CreateSongInput } from '../domain/song'
import { AssetRepository, SongRepository } from './ports'

export const listSongs = (actor: Actor, params: PageParams) =>
  Effect.flatMap(SongRepository, (songs) => songs.list(actor.orgId, params))

export const listAllSongs = (actor: Actor) => Effect.flatMap(SongRepository, (songs) => songs.listAll(actor.orgId))

/** Song with its files (presigned URLs for uploaded ones) and their group tags. */
export const getSongDetail = (actor: Actor, songId: string) =>
  Effect.gen(function* () {
    const songs = yield* SongRepository
    const assets = yield* AssetRepository
    const storage = yield* FileStorage
    const song = yield* songs.get(actor.orgId, songId)
    const [files, tags] = yield* Effect.all([assets.listForSong(songId), assets.groupsForSong(songId)])
    const detailed = yield* Effect.all(
      files.map((a) =>
        Effect.gen(function* () {
          const url = a.status === 'ready' ? yield* storage.presignGet(a.storageKey) : null
          return { ...a, url, groups: tags.filter((t) => t.assetId === a.id).map((t) => t.group) }
        }),
      ),
    )
    return { song, assets: detailed }
  })

export const createSong = (actor: Actor, input: CreateSongInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const songs = yield* SongRepository
    return yield* songs.create(actor.orgId, input)
  })

export const updateSong = (actor: Actor, songId: string, input: CreateSongInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const songs = yield* SongRepository
    return yield* songs.update(actor.orgId, songId, input)
  })

/**
 * Deletes a song and its files. Rows first: a leftover object is harmless, a row
 * pointing at a deleted object is a broken file in the UI. The DB cascade alone
 * would leave every object behind in storage.
 */
export const deleteSong = (actor: Actor, songId: string) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const songs = yield* SongRepository
    const assets = yield* AssetRepository
    yield* songs.get(actor.orgId, songId)
    const keys = yield* assets.storageKeysForSong(songId)
    yield* assets.removeForSong(songId)
    yield* songs.remove(actor.orgId, songId)
    yield* removeObjects(keys)
  })
