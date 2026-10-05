import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Effect, Layer } from 'effect'
import { invitation, invitationGroup, memberGroup } from '../db/schema'
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors'
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

  async function acceptedInvite() {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    const singer = await seedUser(t.db)
    const m = await seedMember(t.db, org.id, singer.id, 'member')
    const inv = await seedInvitation(org.id, owner.id, singer.email, 'accepted')
    const [alto, sop] = [await seedGroup(t.db, org.id, 'Alto'), await seedGroup(t.db, org.id, 'Soprano')]
    await t.db.insert(invitationGroup).values([
      { invitationId: inv.id, groupId: alto.id },
      { invitationId: inv.id, groupId: sop.id },
    ])
    return { org, singer, member: m, invitation: inv, groups: [alto, sop] }
  }

  it('copies invitation groups onto the member on acceptance, idempotently', async () => {
    const { singer, member: m, invitation: inv, groups } = await acceptedInvite()

    await run(Effect.flatMap(Members, (s) => s.finalizeAcceptance(singer.id, m.id, inv.id)))
    await run(Effect.flatMap(Members, (s) => s.finalizeAcceptance(singer.id, m.id, inv.id)))
    const rows = await t.db.select().from(memberGroup)
    expect(rows.map((r) => r.groupId).sort()).toEqual(groups.map((g) => g.id).sort())
  })

  it('refuses to finalize for someone else, another org or a pending invitation', async () => {
    const { org, singer, member: m, invitation: inv } = await acceptedInvite()
    const intruder = await seedUser(t.db)
    const intruderMember = await seedMember(t.db, (await seedOrg(t.db, 'Other')).id, intruder.id, 'member')
    const pending = await seedInvitation(org.id, singer.id, 'later@test.local')

    for (const [userId, memberId, invitationId] of [
      [intruder.id, m.id, inv.id], // someone else's member row
      [intruder.id, intruderMember.id, inv.id], // invitation of another org
      [singer.id, m.id, pending.id], // not accepted yet
    ]) {
      const err = await fail(Effect.flatMap(Members, (s) => s.finalizeAcceptance(userId!, memberId!, invitationId!)))
      expect(err).toBeInstanceOf(ForbiddenError)
    }
    expect(await t.db.select().from(memberGroup)).toEqual([])
  })

  it('replaces member groups', async () => {
    const org = await seedOrg(t.db)
    const m = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    const [a, b] = [await seedGroup(t.db, org.id, 'A'), await seedGroup(t.db, org.id, 'B')]
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(org.id, m.id, [a.id])))
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(org.id, m.id, [b.id, b.id])))
    expect((await t.db.select().from(memberGroup)).map((r) => r.groupId)).toEqual([b.id])
    await run(Effect.flatMap(Members, (s) => s.updateMemberGroups(org.id, m.id, [])))
    expect(await t.db.select().from(memberGroup)).toEqual([])
  })

  it('refuses member groups across organizations', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const mine = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    const theirs = await seedMember(t.db, other.id, (await seedUser(t.db)).id, 'member')
    const myGroup = await seedGroup(t.db, org.id, 'Mine')
    const theirGroup = await seedGroup(t.db, other.id, 'Theirs')

    for (const eff of [
      Effect.flatMap(Members, (s) => s.updateMemberGroups(org.id, theirs.id, [myGroup.id])),
      Effect.flatMap(Members, (s) => s.updateMemberGroups(org.id, mine.id, [theirGroup.id])),
    ]) {
      expect(await fail(eff)).toBeInstanceOf(NotFoundError)
    }
    expect(await t.db.select().from(memberGroup)).toEqual([])
  })

  it('rejects an invitation with a group of another organization before creating it', async () => {
    const org = await seedOrg(t.db, 'A')
    const foreign = await seedGroup(t.db, (await seedOrg(t.db, 'B')).id, 'Theirs')
    const err = await fail(
      Effect.flatMap(Members, (s) =>
        s.createInvite(headers, org.id, {
          email: 'x@y.z',
          firstName: null,
          lastName: null,
          role: 'member',
          groupIds: [foreign.id],
        }),
      ),
    )
    expect(err).toBeInstanceOf(NotFoundError)
    expect(authApi.createInvitation).not.toHaveBeenCalled()
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
