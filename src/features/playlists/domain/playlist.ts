import { Schema } from 'effect'

export const CreatePlaylistInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1, { message: () => 'Le nom est requis' }), Schema.maxLength(120)),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(2000))),
})
export type CreatePlaylistInput = typeof CreatePlaylistInput.Type

export interface Playlist {
  id: string
  organizationId: string
  name: string
  description: string | null
  createdAt: Date
}

export interface PlaylistEventDate {
  id: string
  playlistId: string
  eventDate: Date
  createdAt: Date
}
