import { describe, it, expect } from 'vitest'
import { redactPath } from './analytics'

describe('redactPath', () => {
  it('hides share link tokens and invitation ids', () => {
    expect(redactPath('/s/abc123')).toBe('/s/:token')
    expect(redactPath('/accept-invite/inv_42')).toBe('/accept-invite/:invitationId')
  })

  it('keeps every other path as is', () => {
    expect(redactPath('/playlists/p1')).toBe('/playlists/p1')
    expect(redactPath('/songs')).toBe('/songs')
  })
})
