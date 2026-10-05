import { describe, it, expect } from 'vitest'
import { formatEventDate } from '@/shared/ui/lib/dates'

describe('formatEventDate', () => {
  it('shows Paris time whatever the machine time zone (server renders in UTC)', () => {
    // 19:00 UTC = 20:00 in Paris in winter, 21:00 in summer.
    expect(formatEventDate('2026-12-24T19:00:00.000Z')).toBe('24 décembre 2026 à 20:00')
    expect(formatEventDate(new Date('2026-06-21T19:00:00.000Z'))).toBe('21 juin 2026 à 21:00')
  })
})
