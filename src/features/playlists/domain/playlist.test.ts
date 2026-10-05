import { describe, it, expect } from 'vitest'
import { Schema } from 'effect'
import { CreatePlaylistInput } from './playlist'
import { CreateGroupInput } from '@/features/groups/domain/group'

describe('name inputs', () => {
  it('trim names and reject blank or oversized ones', () => {
    expect(Schema.decodeUnknownSync(CreatePlaylistInput)({ name: '  Noël ', description: null })).toEqual({
      name: 'Noël',
      description: null,
    })
    expect(() => Schema.decodeUnknownSync(CreatePlaylistInput)({ name: '   ', description: null })).toThrow()
    expect(() => Schema.decodeUnknownSync(CreatePlaylistInput)({ name: 'N', description: 'x'.repeat(2001) })).toThrow()
    expect(Schema.decodeUnknownSync(CreateGroupInput)({ name: ' Basses ' })).toEqual({ name: 'Basses' })
    expect(() => Schema.decodeUnknownSync(CreateGroupInput)({ name: 'x'.repeat(61) })).toThrow()
  })
})
