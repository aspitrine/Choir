import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { ForbiddenError, NotFoundError } from '@/shared/domain/errors'
import { PAGE_SIZE } from '@/shared/domain/pagination'
import { actorOf, createTestDb, fail, run, testLayer, type TestDb } from '@/test/db'
import { seedGroup, seedOrg } from '@/test/fixtures'
import { createGroup, deleteGroup, listGroups, requireOrgGroups, searchGroups } from './groups'

let t: TestDb
let layer: ReturnType<typeof testLayer>
beforeAll(async () => {
  t = await createTestDb()
  layer = testLayer(t)
})
beforeEach(() => t.reset())

describe('groups', () => {
  it('creates groups with a unique slug, even for the same name', async () => {
    const org = await seedOrg(t.db)
    const a = await run(layer, createGroup(actorOf(org.id), 'Sopranes Élèves'))
    const b = await run(layer, createGroup(actorOf(org.id), 'Sopranes Élèves'))
    expect(a.slug).toMatch(/^sopranes-eleves-[0-9a-f]{6}$/)
    expect(a.slug).not.toBe(b.slug)
  })

  it('lets only managers create or delete groups', async () => {
    const org = await seedOrg(t.db)
    const g = await seedGroup(t.db, org.id, 'Basse')
    const singer = actorOf(org.id, 'member')
    expect(await fail(layer, createGroup(singer, 'Alto'))).toBeInstanceOf(ForbiddenError)
    expect(await fail(layer, deleteGroup(singer, g.id))).toBeInstanceOf(ForbiddenError)
    expect(await run(layer, listGroups(singer))).toHaveLength(1)
  })

  it('scopes listing, search and deletion to the choir', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    await seedGroup(t.db, org.id, 'Alto')
    const foreign = await seedGroup(t.db, other.id, 'Alto')
    for (let i = 0; i < PAGE_SIZE; i++) await seedGroup(t.db, org.id, `Pupitre ${i}`)

    expect(await run(layer, listGroups(actorOf(org.id)))).toHaveLength(PAGE_SIZE + 1)
    const page2 = await run(layer, searchGroups(actorOf(org.id), { q: '', page: 2 }))
    expect(page2).toMatchObject({ total: PAGE_SIZE + 1, page: 2 })
    expect(page2.rows).toHaveLength(1)
    const found = await run(layer, searchGroups(actorOf(org.id), { q: 'alt', page: 1 }))
    expect(found.rows.map((g) => g.name)).toEqual(['Alto'])

    expect(await fail(layer, deleteGroup(actorOf(org.id), foreign.id))).toBeInstanceOf(NotFoundError)
  })

  it('searches LIKE wildcards literally, in a stable order', async () => {
    const org = await seedOrg(t.db)
    await seedGroup(t.db, org.id, 'Ténors_1')
    await seedGroup(t.db, org.id, 'TénorsX1')
    await seedGroup(t.db, org.id, '100% jeunes')
    const search = (q: string) => run(layer, searchGroups(actorOf(org.id), { q, page: 1 }))
    expect((await search('_1')).rows.map((g) => g.name)).toEqual(['Ténors_1'])
    expect((await search('%')).rows.map((g) => g.name)).toEqual(['100% jeunes'])
    expect((await search('')).rows.map((g) => g.name)).toEqual(['100% jeunes', 'TénorsX1', 'Ténors_1'].sort())
  })
})

describe('requireOrgGroups', () => {
  it('returns the ids deduplicated when they all belong to the choir', async () => {
    const org = await seedOrg(t.db)
    const g = await seedGroup(t.db, org.id, 'Basse')
    expect(await run(layer, requireOrgGroups(org.id, [g.id, g.id]))).toEqual([g.id])
    expect(await run(layer, requireOrgGroups(org.id, []))).toEqual([])
  })

  it('rejects a group of another choir or an unknown id', async () => {
    const org = await seedOrg(t.db, 'A')
    const mine = await seedGroup(t.db, org.id, 'Mine')
    const theirs = await seedGroup(t.db, (await seedOrg(t.db, 'B')).id, 'Theirs')
    const err = await fail(layer, requireOrgGroups(org.id, [mine.id, theirs.id, 'nope']))
    expect(err).toEqual(new NotFoundError({ entity: 'group', id: `${theirs.id},nope` }))
  })
})
