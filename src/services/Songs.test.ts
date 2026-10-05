import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Songs, SongsLive } from './Songs'
import { NotFoundError } from '../domain/errors'
import { PAGE_SIZE } from '../domain/pagination'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedAsset, seedOrg, seedSong } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<Songs>>
let fail: ReturnType<typeof failWith<Songs>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = SongsLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(() => t.reset())

const input = { title: 'Ave Maria', composer: 'Caccini', arranger: null, key: 'Do', tempo: null, notes: null }
const songs = Effect.flatMap(Songs, Effect.succeed)

describe('Songs', () => {
  it('creates, reads, updates and removes a song', async () => {
    const org = await seedOrg(t.db)
    const created = await run(Effect.flatMap(songs, (s) => s.create(org.id, input)))
    expect(created).toMatchObject({ title: 'Ave Maria', composer: 'Caccini', organizationId: org.id })

    const fetched = await run(Effect.flatMap(songs, (s) => s.get(org.id, created.id)))
    expect(fetched.id).toBe(created.id)

    const updated = await run(
      Effect.flatMap(songs, (s) => s.update(org.id, created.id, { ...input, title: 'Ave', composer: null })),
    )
    expect(updated).toMatchObject({ title: 'Ave', composer: null })
    // timestamptz: DB defaults and JS dates agree whatever the session time zone.
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())

    await run(Effect.flatMap(songs, (s) => s.remove(org.id, created.id)))
    const err = await fail(Effect.flatMap(songs, (s) => s.get(org.id, created.id)))
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it('never exposes a song to another organization', async () => {
    const mine = await seedOrg(t.db, 'Mine')
    const other = await seedOrg(t.db, 'Other')
    const song = await seedSong(t.db, mine.id, 'Secret')

    expect(await fail(Effect.flatMap(songs, (s) => s.get(other.id, song.id)))).toBeInstanceOf(NotFoundError)
    expect(await fail(Effect.flatMap(songs, (s) => s.update(other.id, song.id, input)))).toBeInstanceOf(
      NotFoundError,
    )
    expect(await fail(Effect.flatMap(songs, (s) => s.remove(other.id, song.id)))).toBeInstanceOf(NotFoundError)
    expect(await fail(Effect.flatMap(songs, (s) => s.listAssets(other.id, song.id)))).toBeInstanceOf(
      NotFoundError,
    )
    expect(await run(Effect.flatMap(songs, (s) => s.listAll(other.id)))).toEqual([])
  })

  it('paginates and searches by title or composer', async () => {
    const org = await seedOrg(t.db)
    for (let i = 0; i < PAGE_SIZE + 5; i++) await seedSong(t.db, org.id, `Chant ${i}`)
    await run(Effect.flatMap(songs, (s) => s.create(org.id, { ...input, title: 'Requiem', composer: 'Fauré' })))

    const page1 = await run(Effect.flatMap(songs, (s) => s.list(org.id, { q: '', page: 1 })))
    const page2 = await run(Effect.flatMap(songs, (s) => s.list(org.id, { q: '', page: 2 })))
    expect(page1.total).toBe(PAGE_SIZE + 6)
    expect(page1.rows).toHaveLength(PAGE_SIZE)
    expect(page2.rows).toHaveLength(6)

    const byComposer = await run(Effect.flatMap(songs, (s) => s.list(org.id, { q: ' faur ', page: 1 })))
    expect(byComposer.rows.map((r) => r.title)).toEqual(['Requiem'])
    const byTitle = await run(Effect.flatMap(songs, (s) => s.list(org.id, { q: 'REQUI', page: 1 })))
    expect(byTitle.total).toBe(1)
  })

  it('lists the assets of a song', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const a = await seedAsset(t.db, song.id, { kind: 'audio' })
    const assets = await run(Effect.flatMap(songs, (s) => s.listAssets(org.id, song.id)))
    expect(assets.map((x) => x.id)).toEqual([a.id])
  })
})
