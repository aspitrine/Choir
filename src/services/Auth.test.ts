import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { ForbiddenError, UnauthenticatedError } from '../domain/errors'
import { createTestDb } from '../test/db'
import { seedMember, seedOrg, seedUser } from '../test/fixtures'
import { AuthService, AuthServiceLive } from './Auth'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ auth: { api: { getSession } } }))

let t: Awaited<ReturnType<typeof createTestDb>>
const run = <A, E>(eff: Effect.Effect<A, E, AuthService>) =>
  Effect.runPromise(Effect.either(eff).pipe(Effect.provide(AuthServiceLive.pipe(Layer.provide(t.layer)))))

beforeAll(async () => {
  t = await createTestDb()
})
beforeEach(async () => {
  getSession.mockReset()
  await t.reset()
})

const headers = new Headers({ cookie: 'x' })
const sessionFor = (userId: string, activeOrganizationId: string | null) => ({
  user: { id: userId },
  session: { activeOrganizationId },
})

describe('AuthService', () => {
  it('fails unauthenticated without a session', async () => {
    getSession.mockResolvedValue(null)
    const result = await run(Effect.flatMap(AuthService, (a) => a.requireSession(headers)))
    expect(result._tag === 'Left' && result.left).toBeInstanceOf(UnauthenticatedError)
    expect(getSession).toHaveBeenCalledWith({ headers })
  })

  it('requires an active organization', async () => {
    getSession.mockResolvedValue(sessionFor('u1', null))
    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result._tag === 'Left' && result.left).toEqual(new ForbiddenError({ reason: 'no-active-organization' }))
  })

  it('returns the active organization of a member', async () => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    await seedMember(t.db, org.id, user.id, 'member')
    getSession.mockResolvedValue(sessionFor(user.id, org.id))

    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result).toMatchObject({ _tag: 'Right', right: { orgId: org.id, userId: user.id } })
  })

  it('rejects a session whose active organization the user was removed from', async () => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    // Session still points at the org, but there is no member row any more.
    getSession.mockResolvedValue(sessionFor(user.id, org.id))

    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result._tag === 'Left' && result.left).toEqual(new ForbiddenError({ reason: 'not-a-member' }))
  })

  it('does not accept membership of another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const user = await seedUser(t.db)
    await seedMember(t.db, other.id, user.id, 'owner')
    getSession.mockResolvedValue(sessionFor(user.id, org.id))

    const result = await run(Effect.flatMap(AuthService, (a) => a.requireActiveOrganizationId(headers)))
    expect(result._tag).toBe('Left')
  })
})
