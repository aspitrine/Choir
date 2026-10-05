import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Access, AccessLive } from './Access'
import { ForbiddenError } from '../domain/errors'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedMember, seedOrg, seedUser } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<Access>>
let fail: ReturnType<typeof failWith<Access>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = AccessLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(() => t.reset())

describe('Access', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
  ] as const)('%s → manager: %s', async (role, manager) => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    await seedMember(t.db, org.id, user.id, role)

    expect(await run(Effect.flatMap(Access, (a) => a.getRole(org.id, user.id)))).toBe(role)
    expect(await run(Effect.flatMap(Access, (a) => a.isManager(org.id, user.id)))).toBe(manager)
  })

  it('treats a non-member as a plain member', async () => {
    const org = await seedOrg(t.db)
    const user = await seedUser(t.db)
    expect(await run(Effect.flatMap(Access, (a) => a.getRole(org.id, user.id)))).toBe('member')
  })

  it('requireManager rejects members and accepts admins', async () => {
    const org = await seedOrg(t.db)
    const singer = await seedUser(t.db)
    const director = await seedUser(t.db)
    await seedMember(t.db, org.id, singer.id, 'member')
    await seedMember(t.db, org.id, director.id, 'admin')

    const err = await fail(Effect.flatMap(Access, (a) => a.requireManager(org.id, singer.id)))
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.reason).toBe('manager-role-required')
    await run(Effect.flatMap(Access, (a) => a.requireManager(org.id, director.id)))
  })

  it('does not leak a role from another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const user = await seedUser(t.db)
    await seedMember(t.db, other.id, user.id, 'owner')
    expect(await run(Effect.flatMap(Access, (a) => a.isManager(org.id, user.id)))).toBe(false)
  })
})
