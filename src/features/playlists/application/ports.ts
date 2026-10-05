import { Context, type Effect } from 'effect'
import type { NotFoundError } from '@/shared/domain/errors'
import type { Song } from '@/features/songs/application/ports'
import type { CreatePlaylistInput, Playlist, PlaylistEventDate } from '../domain/playlist'

export type { Playlist, PlaylistEventDate }
export interface PlaylistItem {
  itemId: string
  position: number
  song: Song
}

/** Port: playlists, their ordered songs and event dates, scoped by organization. */
export class PlaylistRepository extends Context.Tag('PlaylistRepository')<
  PlaylistRepository,
  {
    readonly list: (orgId: string) => Effect.Effect<Array<Playlist>>
    readonly get: (orgId: string, playlistId: string) => Effect.Effect<Playlist, NotFoundError>
    readonly create: (orgId: string, input: CreatePlaylistInput) => Effect.Effect<Playlist>
    readonly remove: (playlistId: string) => Effect.Effect<void>
    readonly listItems: (playlistId: string) => Effect.Effect<Array<PlaylistItem>>
    readonly itemIds: (playlistId: string) => Effect.Effect<Array<string>>
    /** Appends atomically: concurrent appends never pick the same position. */
    readonly appendSong: (playlistId: string, songId: string) => Effect.Effect<void>
    readonly removeItem: (playlistId: string, itemId: string) => Effect.Effect<void>
    /** Applies a full new order atomically. */
    readonly reorder: (playlistId: string, itemIdsInOrder: ReadonlyArray<string>) => Effect.Effect<void>
    readonly listEventDates: (playlistId: string) => Effect.Effect<Array<PlaylistEventDate>>
    readonly addEventDate: (playlistId: string, eventDate: Date) => Effect.Effect<void>
    readonly removeEventDate: (playlistId: string, eventDateId: string) => Effect.Effect<void>
    readonly listWithEventDates: (
      orgId: string,
    ) => Effect.Effect<{ playlists: Array<Playlist>; dates: Array<PlaylistEventDate> }>
  }
>() {}
