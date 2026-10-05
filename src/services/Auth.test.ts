import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import { ForbiddenError, UnauthenticatedError } from '../domain/errors'
import { AuthService, AuthServiceLive } from './Auth'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ auth: { api: { getSession } } }))

const run = <A, E>(eff: Effect.Effect<A, E, AuthService>) =>
  Effect.runPromise(Effect.either(eff).pipe(Effect.provide(AuthServiceLive)))

beforeEach(() => getSession.mockReset())

const headers = new Headers({ cookie: 'x' })

describe('AuthService', () => {
  it('fails unauthenticated without a session', async () => {
    getSession.mockResolvedValue(null)
    const result = await run(Effect.flatMap(AuthService, (a) => a.requireSession(headers)))
    expect(result._tag).toBe('Left')
    expect(result._tag === 'Left' && result.left).toBeInstanceOf(UnauthenticatedError)
    expect(getSession).toHaveBeenCalledWith({ headers })
  })

  it('requires an active organization', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' }, session: { activeOrganizationId: null } })
    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result._tag === 'Left' && result.left).toEqual(new ForbiddenError({ reason: 'no-active-organization' }))
  })

  it('returns the active organization and user', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' }, session: { activeOrganizationId: 'o1' } })
    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result).toMatchObject({ _tag: 'Right', right: { orgId: 'o1', userId: 'u1' } })
  })
})
