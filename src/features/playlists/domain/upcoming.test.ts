import { describe, it, expect } from 'vitest'
import { selectUpcoming } from './upcoming'

const now = new Date('2026-10-05T12:00:00Z')
const day = (offset: number) => new Date(now.getTime() + offset * 24 * 3600 * 1000)

describe('selectUpcoming', () => {
  it('shows dated playlists soonest first, then undated ones, and hides past ones', () => {
    const playlists = ['undated', 'past', 'soon', 'later'].map((id) => ({ id }))
    const dates = [
      { playlistId: 'past', eventDate: day(-5) },
      { playlistId: 'soon', eventDate: day(-5) },
      { playlistId: 'soon', eventDate: day(3) },
      { playlistId: 'later', eventDate: day(20) },
    ]
    const result = selectUpcoming(playlists, dates, now)
    expect(result.map((r) => r.playlist.id)).toEqual(['soon', 'later', 'undated'])
    expect(result[0]).toMatchObject({ nextEventDate: day(3), eventDateCount: 2 })
    expect(result[2]).toMatchObject({ nextEventDate: null, eventDateCount: 0 })
  })

  it('counts an event happening right now as upcoming', () => {
    expect(selectUpcoming([{ id: 'p' }], [{ playlistId: 'p', eventDate: now }], now)).toHaveLength(1)
  })
})
