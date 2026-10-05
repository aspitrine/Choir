import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, fakeAuthority, run, testLayer, type TestDb } from '@/test/db'
import { seedGroup, seedMember, seedOrg, seedUser } from '@/test/fixtures'
import { invitation, member } from '@/features/auth/infrastructure/schema'
import { invitationGroup, memberGroup } from '../infrastructure/schema'
import {
  acceptInvite,
  createInvite,
  finalizeAcceptance,
  searchInvitations,
  searchMembers,
  updateMemberGroups,
  updateMemberRole,
} from './members'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
})
beforeEach(() => t.reset())

async function seedInvitation(orgId: string, inviterId: string, email: string, status = 'pending') {
  const [row] = await t.db
    .insert(invitation)
    .values({ id: crypto.randomUUID(), organizationId: orgId, email, status, inviterId, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) })
    .returning()
  return row!
}

describe('listing', () => {
  it('searches members by name or email, literally, with their groups', async () => {
    const org = await seedOrg(t.db)
    const alice = await seedUser(t.db, { name: 'Anne_Marie', email: 'am@test.local' })
    await seedMember(t.db, org.id, (await seedUser(t.db, { name: 'AnneXMarie', email: 'ax@test.local' })).id, 'member')
    const m = await seedMember(t.db, org.id, alice.id, 'owner')
    const sop = await seedGroup(t.db, org.id, 'Soprano')
    await t.db.insert(memberGroup).values({ memberId: m.id, groupId: sop.id })

    const page = await run(testLayer(t), searchMembers(actorOf(org.id), { q: 'e_m', page: 1 }))
    expect(page.rows.map((r) => r.user.name)).toEqual(['Anne_Marie'])
    expect(page.rows[0]!.groups.map((g) => g.name)).toEqual(['Soprano'])
  })

  it('lists only pending invitations, to managers only', async () => {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    await seedInvitation(org.id, owner.id, 'pending@test.local')
    await seedInvitation(org.id, owner.id, 'done@test.local', 'accepted')
    const page = await run(testLayer(t), searchInvitations(actorOf(org.id), { q: '', page: 1 }))
    expect(page.rows.map((r) => r.invitation.email)).toEqual(['pending@test.local'])

    const singer = actorOf(org.id, 'member')
    expect(await fail(testLayer(t), searchInvitations(singer, { q: '', page: 1 }))).toBeInstanceOf(ForbiddenError)
    expect(await fail(testLayer(t), searchMembers(singer, { q: '', page: 1 }))).toBeInstanceOf(ForbiddenError)
  })
})

describe('invitations', () => {
  const input = { email: 'singer@test.local', firstName: 'Jeanne', lastName: null, role: 'admin' as const, groupIds: [] as Array<string> }

  async function invited() {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    const basse = await seedGroup(t.db, org.id, 'Basse')
    const createInvitation = vi.fn(({ email }: { email: string }) =>
      Effect.promise(() => seedInvitation(org.id, owner.id, email)).pipe(Effect.map((row) => ({ id: row.id }))),
    )
    const created = await run(
      testLayer(t, { authority: fakeAuthority({ createInvitation }) }),
      createInvite(actorOf(org.id), { ...input, groupIds: [basse.id] }),
    )
    const singer = await seedUser(t.db, { email: input.email })
    // Stand-in for Better Auth accepting: creates the member and marks the invitation accepted.
    const acceptInvitation = vi.fn((invitationId: string) =>
      Effect.promise(async () => {
        await t.db.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, invitationId))
        return { memberId: (await seedMember(t.db, org.id, singer.id, 'admin')).id }
      }),
    )
    const layer = testLayer(t, { authority: fakeAuthority({ acceptInvitation }) })
    return { org, basse, created, singer, createInvitation, acceptInvitation, layer }
  }

  it('creates the invitation through the authority and stores its secret and groups', async () => {
    const { org, basse, created, createInvitation } = await invited()
    expect(createInvitation).toHaveBeenCalledWith({ orgId: org.id, email: input.email, role: 'admin', firstName: 'Jeanne', lastName: null })
    expect(created.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [row] = await t.db.select().from(invitation).where(eq(invitation.id, created.id))
    expect(row!.secret).toBe(created.secret)
    expect(await t.db.select().from(invitationGroup)).toEqual([{ invitationId: created.id, groupId: basse.id }])
  })

  it('checks groups before creating anything, and refuses members', async () => {
    const org = await seedOrg(t.db, 'A')
    const foreign = await seedGroup(t.db, (await seedOrg(t.db, 'B')).id, 'Theirs')
    const createInvitation = vi.fn()
    const layer = testLayer(t, { authority: fakeAuthority({ createInvitation }) })
    expect(await fail(layer, createInvite(actorOf(org.id), { ...input, groupIds: [foreign.id] }))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, createInvite(actorOf(org.id, 'member'), input))).toBeInstanceOf(ForbiddenError)
    expect(createInvitation).not.toHaveBeenCalled()
  })

  it('accepts with the right secret and grants the invitation groups', async () => {
    const { created, singer, basse, layer, acceptInvitation } = await invited()
    await run(layer, acceptInvite(singer.id, created.id, created.secret))
    expect(acceptInvitation).toHaveBeenCalledWith(created.id)
    expect((await t.db.select().from(memberGroup)).map((r) => r.groupId)).toEqual([basse.id])
  })

  it.each([
    ['a wrong secret', (s: string) => 'x'.repeat(s.length)],
    ['an empty secret', () => ''],
    ['a prefix of the secret', (s: string) => s.slice(0, 10)],
  ])('refuses %s without reaching the authority', async (_label, tamper) => {
    const { created, singer, layer, acceptInvitation } = await invited()
    expect(await fail(layer, acceptInvite(singer.id, created.id, tamper(created.secret)))).toBeInstanceOf(ForbiddenError)
    expect(acceptInvitation).not.toHaveBeenCalled()
    expect(await t.db.select().from(member).where(eq(member.userId, singer.id))).toEqual([])
  })

  it('refuses invitations without a secret (created before secrets existed)', async () => {
    const { created, singer, layer } = await invited()
    await t.db.update(invitation).set({ secret: null }).where(eq(invitation.id, created.id))
    expect(await fail(layer, acceptInvite(singer.id, created.id, ''))).toBeInstanceOf(ForbiddenError)
  })

  it('reports authority refusals (wrong recipient, expired…) as validation errors', async () => {
    const { created, singer } = await invited()
    const layer = testLayer(t, {
      authority: fakeAuthority({
        acceptInvitation: () => Effect.fail(new ValidationError({ message: 'You are not the recipient of the invitation' })),
      }),
    })
    expect(await fail(layer, acceptInvite(singer.id, created.id, created.secret))).toBeInstanceOf(ValidationError)
    expect(await t.db.select().from(memberGroup)).toEqual([])
  })
})

describe('finalizeAcceptance', () => {
  it('only grants groups to the caller own member row of an accepted invitation, idempotently', async () => {
    const org = await seedOrg(t.db)
    const owner = await seedUser(t.db)
    const singer = await seedUser(t.db)
    const intruder = await seedUser(t.db)
    const m = await seedMember(t.db, org.id, singer.id, 'member')
    const inv = await seedInvitation(org.id, owner.id, 'singer@test.local', 'accepted')
    const pending = await seedInvitation(org.id, owner.id, 'later@test.local')
    const alto = await seedGroup(t.db, org.id, 'Alto')
    await t.db.insert(invitationGroup).values({ invitationId: inv.id, groupId: alto.id })
    const layer = testLayer(t)

    expect(await fail(layer, finalizeAcceptance(intruder.id, m.id, inv.id))).toBeInstanceOf(ForbiddenError)
    expect(await fail(layer, finalizeAcceptance(singer.id, m.id, pending.id))).toBeInstanceOf(ForbiddenError)
    await run(layer, finalizeAcceptance(singer.id, m.id, inv.id))
    await run(layer, finalizeAcceptance(singer.id, m.id, inv.id))
    expect((await t.db.select().from(memberGroup)).map((r) => r.groupId)).toEqual([alto.id])
  })
})

describe('member management', () => {
  it('forbids changing your own role without calling the authority', async () => {
    const org = await seedOrg(t.db)
    const me = await seedUser(t.db)
    const m = await seedMember(t.db, org.id, me.id, 'owner')
    const updateMemberRoleSpy = vi.fn(() => Effect.void)
    const layer = testLayer(t, { authority: fakeAuthority({ updateMemberRole: updateMemberRoleSpy }) })
    expect(await fail(layer, updateMemberRole(actorOf(org.id, 'owner', me.id), m.id, 'member'))).toBeInstanceOf(ValidationError)
    expect(updateMemberRoleSpy).not.toHaveBeenCalled()

    const other = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    await run(layer, updateMemberRole(actorOf(org.id, 'owner', me.id), other.id, 'admin'))
    expect(updateMemberRoleSpy).toHaveBeenCalledWith(org.id, other.id, 'admin')
  })

  it('replaces member groups within the choir only', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const mine = await seedMember(t.db, org.id, (await seedUser(t.db)).id, 'member')
    const theirs = await seedMember(t.db, other.id, (await seedUser(t.db)).id, 'member')
    const [a, b] = [await seedGroup(t.db, org.id, 'A'), await seedGroup(t.db, org.id, 'B')]
    const foreign = await seedGroup(t.db, other.id, 'Theirs')
    const layer = testLayer(t)

    await run(layer, updateMemberGroups(actorOf(org.id), mine.id, [a.id]))
    await run(layer, updateMemberGroups(actorOf(org.id), mine.id, [b.id, b.id]))
    expect((await t.db.select().from(memberGroup)).map((r) => r.groupId)).toEqual([b.id])
    expect(await fail(layer, updateMemberGroups(actorOf(org.id), theirs.id, [a.id]))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, updateMemberGroups(actorOf(org.id), mine.id, [foreign.id]))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, updateMemberGroups(actorOf(org.id, 'member'), mine.id, []))).toBeInstanceOf(ForbiddenError)
  })
})
