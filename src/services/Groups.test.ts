import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Groups, GroupsLive } from './Groups'
import { NotFoundError } from '../domain/errors'
import { PAGE_SIZE } from '../domain/pagination'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedGroup, seedOrg } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<Groups>>
let fail: ReturnType<typeof failWith<Groups>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = GroupsLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(() => t.reset())

describe('Groups', () => {
  it('slugifies names, stripping accents and punctuation', async () => {
    const org = await seedOrg(t.db)
    const g = await run(Effect.flatMap(Groups, (s) => s.create(org.id, 'Sopranes Élèves !')))
    expect(g.name).toBe('Sopranes Élèves !')
    expect(g.slug).toMatch(/^sopranes-eleves-[0-9a-f]{6}$/)

    const fallback = await run(Effect.flatMap(Groups, (s) => s.create(org.id, '!!!')))
    expect(fallback.slug).toMatch(/^groupe-[0-9a-f]{6}$/)
  })

  it('allows the same name twice thanks to the random suffix', async () => {
    const org = await seedOrg(t.db)
    await run(Effect.flatMap(Groups, (s) => s.create(org.id, 'Basses')))
    await run(Effect.flatMap(Groups, (s) => s.create(org.id, 'Basses')))
    expect(await run(Effect.flatMap(Groups, (s) => s.list(org.id)))).toHaveLength(2)
  })

  it('scopes list and search to the organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    await seedGroup(t.db, org.id, 'Alto')
    await seedGroup(t.db, other.id, 'Alto')
    for (let i = 0; i < PAGE_SIZE; i++) await seedGroup(t.db, org.id, `Pupitre ${i}`)

    expect(await run(Effect.flatMap(Groups, (s) => s.list(org.id)))).toHaveLength(PAGE_SIZE + 1)
    const page2 = await run(Effect.flatMap(Groups, (s) => s.search(org.id, { q: '', page: 2 })))
    expect(page2).toMatchObject({ total: PAGE_SIZE + 1, page: 2 })
    expect(page2.rows).toHaveLength(1)

    const found = await run(Effect.flatMap(Groups, (s) => s.search(org.id, { q: 'alt', page: 1 })))
    expect(found.rows.map((g) => g.name)).toEqual(['Alto'])
  })

  it('removes only groups of the caller organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const g = await seedGroup(t.db, org.id, 'Basse')

    expect(await fail(Effect.flatMap(Groups, (s) => s.remove(other.id, g.id)))).toBeInstanceOf(NotFoundError)
    await run(Effect.flatMap(Groups, (s) => s.remove(org.id, g.id)))
    expect(await run(Effect.flatMap(Groups, (s) => s.list(org.id)))).toEqual([])
  })

  it('searches LIKE wildcards literally and pages in a stable order', async () => {
    const org = await seedOrg(t.db)
    await seedGroup(t.db, org.id, 'Ténors_1')
    await seedGroup(t.db, org.id, 'TénorsX1')
    await seedGroup(t.db, org.id, '100% jeunes')

    const underscore = await run(Effect.flatMap(Groups, (s) => s.search(org.id, { q: '_1', page: 1 })))
    expect(underscore.rows.map((g) => g.name)).toEqual(['Ténors_1'])
    const percent = await run(Effect.flatMap(Groups, (s) => s.search(org.id, { q: '%', page: 1 })))
    expect(percent.rows.map((g) => g.name)).toEqual(['100% jeunes'])

    const all = await run(Effect.flatMap(Groups, (s) => s.search(org.id, { q: '', page: 1 })))
    expect(all.rows.map((g) => g.name)).toEqual(['100% jeunes', 'TénorsX1', 'Ténors_1'].sort())
  })
})
