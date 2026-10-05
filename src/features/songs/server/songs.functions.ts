import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { PageParams } from '@/shared/domain/pagination'
import { Id } from '@/shared/domain/schemas'
import { decodeInput } from '@/shared/server/request'
import { withActor } from '@/app/runtime'
import { CreateSongInput, UpdateSongInput } from '../domain/song'
import { createSong, deleteSong, getSongDetail, listAllSongs, listSongs, updateSong } from '../application/songs'

const BySong = Schema.Struct({ songId: Id })

export const listSongsFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(PageParams))
  .handler(({ data }) => withActor((actor) => listSongs(actor, data)))

export const listAllSongsFn = createServerFn({ method: 'GET' }).handler(() => withActor(listAllSongs))

export const getSongFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(BySong))
  .handler(({ data }) => withActor((actor) => getSongDetail(actor, data.songId)))

export const createSongFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreateSongInput))
  .handler(({ data }) => withActor((actor) => createSong(actor, data)))

export const updateSongFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(UpdateSongInput))
  .handler(({ data: { songId, ...input } }) => withActor((actor) => updateSong(actor, songId, input)))

export const deleteSongFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(BySong))
  .handler(({ data }) => withActor((actor) => deleteSong(actor, data.songId)))
