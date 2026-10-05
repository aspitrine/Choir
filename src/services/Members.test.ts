import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { invitation, memberGroup } from '../db/schema'
import { ValidationError } from '../domain/errors'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedGroup, seedMember, seedOrg, seedUser } from '../test/fixtures'
import { Members, MembersLive } from './Members'

// Better Auth endpoints are its own concern; here they are stand-ins whose calls we inspect.
const authApi = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  deleteOrganization: vi.fn(),
}))
vi.mock('../lib/auth', () => ({ auth: { api: authApi } }))

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<Members>>
let fail: ReturnType<typeof failWith<Members>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = MembersLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(async () => {
  vi.clearAllMocks()
  await t.reset()
})

const headers = new Headers()

async function seedInvitation(orgId: string, inviterId: string, email: string, status = 'pending') {
  const [row] = await t.db
    .insert(invitation)
    .values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      email,
      status,
      inviterId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning()
  return row!
}

describe('Members', () => {
  it('searches members by name or email with their groups', async () => {
    const org = await seedOrg(t.db)
    const alice = await seedUser(t.db, { name: 'Alice Martin', email: 'alice@test.local' })
    const bob = await seedUser(t.db, { name: 'Bob', email: 'bob@test.local' })
    const m = await seedMember(t.db, org.id, alice.id, 'owner')
    await seedMember(t.db, org.id, bob.id, 'member')
    const sop = await seedGroup(t.db, org.id, 'Soprano')
    await t.db.insert(memberGroup).values({ memberId: m.id, groupId: sop.id })

    const all = await run(Effect.flatMap(Members, (s) => s.search(org.id, { q: '', page: 1 })))
    expect(all.total).toBe(2)

    const found = await run(Effect.flatMap(Members, (s) => s.search(org.id, { q: 'martin', page: 1 })))
    expect(found.rows.map((r) => r.user.email)).toEqual(['alice@test.local'])
    expect(found.rows[0]!.groups.map((g) => g.name)).toEqual(['Soprano'])
  })

  it('lists only pending invitations', async () => {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    await seedInvitation(org.id, owner.id, 'pending@test.local')
    await seedInvitation(org.id, owner.id, 'done@test.local', 'accepted')

    const page = await run(Effect.flatMap(Members, (s) => s.searchInvitations(org.id, { q: '', page: 1 })))
    expect(page.rows.map((r) => r.invitation.email)).toEqual(['pending@test.local'])
  })

  it('stores group grants on a new invitation', async () => {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    const basse = await seedGroup(t.db, org.id, 'Basse')
    authApi.createInvitation.mockImplementation(async ({ body }: { body: { email: string } }) =>
      seedInvitation(org.id, owner.id, body.email),
    )

    const { id } = await run(
      Effect.flatMap(Members, (s) =>
        s.createInvite(headers, org.id, {
          email: 'new@test.local',
          firstName: 'Jean',
          lastName: null,
          role: 'member',
          groupIds: [basse.id],
        }),
      ),
    )
    expect(authApi.createInvitation).toHaveBeenCalledWith({
      headers,
      body: {
        email: 'new@test.local',
        role: 'member',
        organizationId: org.id,
        firstName: 'Jean',
        lastName: undefined,
      },
    })
    const page = await run(Effect.flatMap(Members, (s) => s.searchInvitations(org.id, { q: '', page: 1 })))
    expect(page.rows.find((r) => r.invitation.id === id)!.groups.map((g) => g.name)).toEqual(['Basse'])
  })

  it('maps Better Auth failures to ValidationError', async () => {
    authApi.createInvitation.mockRejectedValue(new Error('User is already a member'))
    const err = await fail(
      Effect.flatMap(Members, (s) =>
        s.createInvite(headers, 'org', { email: 'x@y.z', firstName: null, lastName: null, role: 'member', groupIds: [] }),
      ),
    )
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.message).toBe('User is already a member')
  })

  it('copies invitation groups onto the member on acceptance', async () => {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    const singer = await seedUser(t.db)
    const m = await seedMember(t.db, org.id, singer.id, 'member')
    const inv = await seedInvitation(org.id, owner.id, 'singer@test.local')
    const [alto, sop] = [await seedGroup(t.db, org.id, 'Alto'), await seedGroup(t.db, org.id, 'Soprano')]
    const { invitationGroup } = await import('../db/schema')
    await t.db.insert(invitationGroup).values([
      { invitationId: inv.id, groupId: alto.id },
      { invitationId: inv.id, groupId: sop.id },
    ])

    await run(Effect.flatMap(Members, (s) => s.finalizeAcceptance(m.id, inv.id)))
    const rows = await t.db.select().from(memberGroup)
    expect(rows.map((r) => r.groupId).sort()).toEqual([alto.id, sop.id].sort())
  })

  it('replaces member groups', async () => {
    const org = await seedOrg(t.db)
    const m = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    const [a, b] = [await seedGroup(t.db, org.id, 'A'), await seedGroup(t.db, org.id, 'B')]
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(m.id, [a.id])))
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(m.id, [b.id])))
    expect((await t.db.select().from(memberGroup)).map((r) => r.groupId)).toEqual([b.id])
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(m.id, [])))
    expect(await t.db.select().from(memberGroup)).toEqual([])
  })

  it('forbids changing your own role without calling Better Auth', async () => {
    const org = await seedOrg(t.db)
    const me = await seedUser(t.db)
    const m = await seedMember(t.db, org.id, me.id, 'owner')

    const err = await fail(Effect.flatMap(Members, (s) => s.updateMemberRole(headers, org.id, me.id, m.id, 'member')))
    expect(err).toBeInstanceOf(ValidationError)
    expect(authApi.updateMemberRole).not.toHaveBeenCalled()
  })

  it('delegates role changes of other members to Better Auth', async () => {
    const org = await seedOrg(t.db)
    const me = await seedUser(t.db)
    const other = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    authApi.updateMemberRole.mockResolvedValue({})

    await run(Effect.flatMap(Members, (s) => s.updateMemberRole(headers, org.id, me.id, other.id, 'admin')))
    expect(authApi.updateMemberRole).toHaveBeenCalledWith({
      headers,
      body: { organizationId: org.id, memberId: other.id, role: 'admin' },
    })
  })
})
