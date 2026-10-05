import { describe, it, expect } from 'vitest'
import { Either, Schema } from 'effect'
import { CreateSongInput, CreateUploadIntentInput, UpdateSongInput } from './songs'
import { CreateOrganizationInput } from './organization'
import { PageParams } from './pagination'

const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknownEither(schema)(input)

const song = { title: 'Ave Maria', composer: null, arranger: null, key: null, tempo: null, notes: null }

describe('CreateSongInput', () => {
  it('accepts a title with nullable metadata', () => {
    expect(Either.isRight(decode(CreateSongInput, song))).toBe(true)
  })

  it('rejects an empty or too long title', () => {
    expect(Either.isLeft(decode(CreateSongInput, { ...song, title: '' }))).toBe(true)
    expect(Either.isLeft(decode(CreateSongInput, { ...song, title: 'x'.repeat(201) }))).toBe(true)
  })

  it('requires songId when updating', () => {
    expect(Either.isLeft(decode(UpdateSongInput, song))).toBe(true)
    expect(Either.isRight(decode(UpdateSongInput, { ...song, songId: 's1' }))).toBe(true)
  })
})

describe('CreateUploadIntentInput', () => {
  const intent = {
    songId: 's1',
    kind: 'audio',
    label: null,
    filename: 'basse.mp3',
    contentType: 'audio/mpeg',
    groupIds: [],
  }

  it('accepts audio and PDF scores', () => {
    expect(Either.isRight(decode(CreateUploadIntentInput, intent))).toBe(true)
    expect(
      Either.isRight(
        decode(CreateUploadIntentInput, { ...intent, kind: 'score', filename: 'a.pdf', contentType: 'application/pdf' }),
      ),
    ).toBe(true)
  })

  it.each(['text/html', 'image/svg+xml', 'application/javascript', 'audio/aiff', 'application/octet-stream'])(
    'rejects %s, which storage would serve back as-is',
    (contentType) => {
      expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, contentType }))).toBe(true)
    },
  )

  it('rejects a kind that does not match the content type', () => {
    expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, kind: 'score' }))).toBe(true)
    expect(
      Either.isLeft(decode(CreateUploadIntentInput, { ...intent, kind: 'audio', contentType: 'application/pdf' })),
    ).toBe(true)
  })

  it('rejects malformed group ids', () => {
    expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, groupIds: 'g1' }))).toBe(true)
    expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, groupIds: [42] }))).toBe(true)
  })

  it('rejects unknown kinds and empty filenames', () => {
    expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, kind: 'video' }))).toBe(true)
    expect(Either.isLeft(decode(CreateUploadIntentInput, { ...intent, filename: '' }))).toBe(true)
  })
})

describe('CreateOrganizationInput', () => {
  it('bounds the name length', () => {
    expect(Either.isLeft(decode(CreateOrganizationInput, { name: 'A' }))).toBe(true)
    expect(Either.isRight(decode(CreateOrganizationInput, { name: 'Chorale' }))).toBe(true)
    expect(Either.isLeft(decode(CreateOrganizationInput, { name: 'x'.repeat(81) }))).toBe(true)
  })
})

describe('PageParams', () => {
  it('requires a positive integer page', () => {
    expect(Either.isRight(decode(PageParams, { q: '', page: 1 }))).toBe(true)
    expect(Either.isLeft(decode(PageParams, { q: '', page: 0 }))).toBe(true)
    expect(Either.isLeft(decode(PageParams, { q: '', page: 1.5 }))).toBe(true)
  })
})
