import { Schema } from 'effect'

export const CreateSongInput = Schema.Struct({
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Le titre est requis' }),
    Schema.maxLength(200, { message: () => 'Le titre est trop long' }),
  ),
  composer: Schema.NullOr(Schema.String),
  arranger: Schema.NullOr(Schema.String),
  key: Schema.NullOr(Schema.String),
  tempo: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
})
export type CreateSongInput = typeof CreateSongInput.Type

// Client-side form shape: plain strings (empty = unset), mapped to CreateSongInput on submit.
const CreateSongFormValues = Schema.Struct({
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Le titre est requis' }),
    Schema.maxLength(200, { message: () => 'Le titre est trop long' }),
  ),
  composer: Schema.String,
  arranger: Schema.String,
  key: Schema.String,
  tempo: Schema.String,
})
export const CreateSongForm = Schema.standardSchemaV1(CreateSongFormValues)

export const UpdateSongInput = Schema.extend(CreateSongInput, Schema.Struct({ songId: Schema.String }))
export type UpdateSongInput = typeof UpdateSongInput.Type

export const AssetKind = Schema.Literal('score', 'audio')

export const CreateUploadIntentInput = Schema.Struct({
  songId: Schema.String,
  kind: AssetKind,
  label: Schema.NullOr(Schema.String),
  filename: Schema.String.pipe(Schema.minLength(1)),
  contentType: Schema.String.pipe(Schema.minLength(1)),
  groupIds: Schema.Array(Schema.String),
})
export type CreateUploadIntentInput = typeof CreateUploadIntentInput.Type
