import { describe, it, expect } from 'vitest'
import { isLinkActive, isVisibleThroughLink } from './share-link'

const now = new Date('2026-10-05T12:00:00Z')

describe('isLinkActive', () => {
  it('is active unless revoked or expired', () => {
    expect(isLinkActive({ revokedAt: null, expiresAt: null }, now)).toBe(true)
    expect(isLinkActive({ revokedAt: null, expiresAt: new Date('2026-10-06') }, now)).toBe(true)
    expect(isLinkActive({ revokedAt: new Date('2026-10-01'), expiresAt: null }, now)).toBe(false)
    expect(isLinkActive({ revokedAt: null, expiresAt: new Date('2026-10-04') }, now)).toBe(false)
  })
})

describe('isVisibleThroughLink', () => {
  it('shows everything through an unfiltered link', () => {
    expect(isVisibleThroughLink(['basse'], [])).toBe(true)
  })
  it('always shows untagged files', () => {
    expect(isVisibleThroughLink([], ['basse'])).toBe(true)
  })
  it('shows tagged files sharing at least one group with the link', () => {
    expect(isVisibleThroughLink(['soprano', 'basse'], ['basse'])).toBe(true)
    expect(isVisibleThroughLink(['alto'], ['basse', 'soprano'])).toBe(false)
  })
})
