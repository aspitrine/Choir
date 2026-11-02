import { Schema } from 'effect'
import { Id } from '@/shared/domain/schemas'

export const CreatePlaylistInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1, { message: () => 'Le nom est requis' }), Schema.maxLength(120)),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(2000))),
})
export type CreatePlaylistInput = typeof CreatePlaylistInput.Type

const PlaylistName = Schema.String.pipe(
  Schema.filter((name) => name.trim().length > 0, { message: () => 'Le nom est requis' }),
  Schema.maxLength(120, { message: () => 'Le nom est trop long' }),
)
export const PlaylistForm = Schema.standardSchemaV1(Schema.Struct({ name: PlaylistName }))
export const PlaylistDetailsForm = Schema.standardSchemaV1(
  Schema.Struct({
    name: PlaylistName,
    description: Schema.String.pipe(Schema.maxLength(2000, { message: () => 'La description est trop longue' })),
  }),
)

export const UpdatePlaylistInput = Schema.extend(CreatePlaylistInput, Schema.Struct({ playlistId: Id }))
export type UpdatePlaylistInput = typeof UpdatePlaylistInput.Type

export const DuplicatePlaylistInput = Schema.Struct({ playlistId: Id, name: CreatePlaylistInput.fields.name })
export type DuplicatePlaylistInput = typeof DuplicatePlaylistInput.Type

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
