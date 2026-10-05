import { Schema } from 'effect'

export const Id = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))
export const GroupIds = Schema.Array(Id).pipe(Schema.maxItems(100))

const OptionalText = (max: number) => Schema.NullOr(Schema.String.pipe(Schema.maxLength(max)))

export const CreateSongInput = Schema.Struct({
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => 'Le titre est requis' }),
    Schema.maxLength(200, { message: () => 'Le titre est trop long' }),
  ),
  composer: OptionalText(200),
  arranger: OptionalText(200),
  key: OptionalText(50),
  tempo: OptionalText(50),
  notes: OptionalText(5000),
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

export const UpdateSongInput = Schema.extend(CreateSongInput, Schema.Struct({ songId: Id }))
export type UpdateSongInput = typeof UpdateSongInput.Type

export const AssetKind = Schema.Literal('score', 'audio')

// Formats browsers can actually decode for playback (excludes AIFF, WMA, etc).
export const PLAYABLE_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
] as const
export const SCORE_MIME_TYPES = ['application/pdf'] as const

export function guessAssetKind(mimeType: string): 'score' | 'audio' {
  return mimeType.startsWith('audio/') ? 'audio' : 'score'
}

// The content type is signed into the upload URL and served back as-is from
// storage, so only allow the formats the app actually displays (never HTML/SVG).
export const CreateUploadIntentInput = Schema.Struct({
  songId: Id,
  kind: AssetKind,
  label: Schema.NullOr(Schema.String.pipe(Schema.maxLength(200))),
  filename: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  contentType: Schema.Literal(...PLAYABLE_AUDIO_MIME_TYPES, ...SCORE_MIME_TYPES),
  groupIds: GroupIds,
}).pipe(
  Schema.filter((input) => guessAssetKind(input.contentType) === input.kind || 'Type de fichier incohérent'),
)
export type CreateUploadIntentInput = typeof CreateUploadIntentInput.Type
