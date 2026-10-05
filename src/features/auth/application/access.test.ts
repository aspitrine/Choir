import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { ForbiddenError, UnauthenticatedError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, run, testLayer, type TestDb } from '@/test/db'
import { seedMember, seedOrg, seedUser } from '@/test/fixtures'
import { currentActor, requireManager, requireOwner } from './access'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
})
beforeEach(() => t.reset())

const headers = new Headers()
const as = (userId: string, activeOrganizationId: string | null) =>
  testLayer(t, { session: { userId, email: `${userId}@test.local`, activeOrganizationId } })

describe('currentActor', () => {
  it('fails unauthenticated without a session', async () => {
    expect(await fail(testLayer(t), currentActor(headers))).toBeInstanceOf(UnauthenticatedError)
  })

  it('requires an active choir', async () => {
    const err = await fail(as('u1', null), currentActor(headers))
    expect(err).toEqual(new ForbiddenError({ reason: 'no-active-organization' }))
  })

  it.each(['owner', 'admin', 'member'] as const)('returns a %s with their role', async (role) => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    await seedMember(t.db, org.id, user.id, role)
    expect(await run(as(user.id, org.id), currentActor(headers))).toEqual({ orgId: org.id, userId: user.id, role })
  })

  it('rejects a session whose active choir the user was removed from', async () => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    const err = await fail(as(user.id, org.id), currentActor(headers))
    expect(err).toEqual(new ForbiddenError({ reason: 'not-a-member' }))
  })

  it('does not accept a membership of another choir', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const user = await seedUser(t.db)
    await seedMember(t.db, other.id, user.id, 'owner')
    expect(await fail(as(user.id, org.id), currentActor(headers))).toBeInstanceOf(ForbiddenError)
  })
})

describe('role checks', () => {
  const passes = (check: Effect.Effect<void, ForbiddenError>) => Effect.runSync(Effect.either(check))._tag === 'Right'

  it.each([
    ['owner', true, true],
    ['admin', true, false],
    ['member', false, false],
  ] as const)('%s → manager: %s, owner: %s', (role, manager, owner) => {
    expect(passes(requireManager(actorOf('org', role)))).toBe(manager)
    expect(passes(requireOwner(actorOf('org', role)))).toBe(owner)
  })
})
