import { describe, it, expect } from 'vitest'
import { Schema } from 'effect'
import { buildInviteLink, CreateInviteInput, generateInvitationSecret, secretsMatch } from './invitation'

describe('invitation secret', () => {
  it('is 32 random bytes in base64url, different every time', () => {
    const a = generateInvitationSecret()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateInvitationSecret()).not.toBe(a)
  })

  it('matches only the exact secret', () => {
    const secret = generateInvitationSecret()
    expect(secretsMatch(secret, secret)).toBe(true)
    expect(secretsMatch(secret, secret.slice(0, 10))).toBe(false)
    expect(secretsMatch(secret, '')).toBe(false)
    expect(secretsMatch(secret, `${secret.slice(0, -1)}${secret.at(-1) === 'a' ? 'b' : 'a'}`)).toBe(false)
  })
})

describe('buildInviteLink', () => {
  it('carries the secret, the email and the choir name', () => {
    const url = new URL(buildInviteLink('https://chorale.test', 'inv1', 's3cr3t', 'jean@example.com', 'Saint-Martin'))
    expect(url.pathname).toBe('/accept-invite/inv1')
    expect(Object.fromEntries(url.searchParams)).toEqual({ email: 'jean@example.com', k: 's3cr3t', org: 'Saint-Martin' })
  })
})

describe('CreateInviteInput', () => {
  const decode = Schema.decodeUnknownEither(CreateInviteInput)
  const invite = { email: 'jean@example.com', firstName: null, lastName: null, role: 'member', groupIds: [] }

  it('never lets a client assign the owner role', () => {
    expect(decode({ ...invite, role: 'owner' })._tag).toBe('Left')
    expect(decode({ ...invite, role: 'admin' })._tag).toBe('Right')
  })

  it('trims and validates emails', () => {
    const decoded = decode({ ...invite, email: '  jean@example.com ' })
    expect(decoded._tag === 'Right' && decoded.right.email).toBe('jean@example.com')
    expect(decode({ ...invite, email: 'not-an-email' })._tag).toBe('Left')
  })
})
