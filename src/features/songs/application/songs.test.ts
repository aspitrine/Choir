import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { ForbiddenError, NotFoundError, StorageError } from '@/shared/domain/errors'
import { PAGE_SIZE } from '@/shared/domain/pagination'
import { actorOf, createTestDb, fail, fakeStorage, run, testLayer, type TestDb } from '@/test/db'
import { seedAsset, seedGroup, seedOrg, seedSong } from '@/test/fixtures'
import { asset, song } from '../infrastructure/schema'
import { createSong, deleteSong, getSongDetail, listAllSongs, listSongs, updateSong } from './songs'

let t: TestDb
let layer: ReturnType<typeof testLayer>
beforeAll(async () => {
  t = await createTestDb()
  layer = testLayer(t)
})
beforeEach(() => t.reset())

const input = { title: 'Ave Maria', composer: 'Caccini', arranger: null, key: 'Do', tempo: null, notes: 'privé' }

describe('songs', () => {
  it('creates, updates and reads a song', async () => {
    const org = await seedOrg(t.db)
    const actor = actorOf(org.id)
    const created = await run(layer, createSong(actor, input))
    expect(created).toMatchObject({ title: 'Ave Maria', organizationId: org.id, notes: 'privé' })

    const updated = await run(layer, updateSong(actor, created.id, { ...input, title: 'Ave', composer: null }))
    expect(updated).toMatchObject({ title: 'Ave', composer: null })
    // timestamptz: DB defaults and JS dates agree whatever the session time zone.
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())

    const { song: fetched } = await run(layer, getSongDetail(actor, created.id))
    expect(fetched.title).toBe('Ave')
  })

  it('lets members read but not write', async () => {
    const org = await seedOrg(t.db)
    const s = await seedSong(t.db, org.id, 'Ave')
    const singer = actorOf(org.id, 'member')
    expect(await fail(layer, createSong(singer, input))).toBeInstanceOf(ForbiddenError)
    expect(await fail(layer, updateSong(singer, s.id, input))).toBeInstanceOf(ForbiddenError)
    expect(await fail(layer, deleteSong(singer, s.id))).toBeInstanceOf(ForbiddenError)
    expect(await run(layer, listAllSongs(singer))).toHaveLength(1)
  })

  it('never exposes a song to another choir', async () => {
    const mine = await seedOrg(t.db, 'Mine')
    const other = actorOf((await seedOrg(t.db, 'Other')).id)
    const s = await seedSong(t.db, mine.id, 'Secret')
    expect(await fail(layer, getSongDetail(other, s.id))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, updateSong(other, s.id, input))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, deleteSong(other, s.id))).toBeInstanceOf(NotFoundError)
    expect(await run(layer, listAllSongs(other))).toEqual([])
  })

  it('paginates and searches by title or composer', async () => {
    const org = await seedOrg(t.db)
    const actor = actorOf(org.id)
    for (let i = 0; i < PAGE_SIZE + 5; i++) await seedSong(t.db, org.id, `Chant ${i}`)
    await run(layer, createSong(actor, { ...input, title: 'Requiem', composer: 'Fauré' }))

    const page1 = await run(layer, listSongs(actor, { q: '', page: 1 }))
    const page2 = await run(layer, listSongs(actor, { q: '', page: 2 }))
    expect(page1.total).toBe(PAGE_SIZE + 6)
    expect(page1.rows).toHaveLength(PAGE_SIZE)
    expect(page2.rows).toHaveLength(6)
    expect((await run(layer, listSongs(actor, { q: ' faur ', page: 1 }))).rows.map((r) => r.title)).toEqual(['Requiem'])
    expect((await run(layer, listSongs(actor, { q: 'REQUI', page: 1 }))).total).toBe(1)
  })

  it('never repeats or skips songs across pages when creation times tie', async () => {
    const org = await seedOrg(t.db)
    for (let i = 0; i < PAGE_SIZE + 7; i++) {
      const s = await seedSong(t.db, org.id, `Chant ${i}`)
      await t.db.update(song).set({ createdAt: new Date('2026-01-01T00:00:00Z') }).where(eq(song.id, s.id))
    }
    const actor = actorOf(org.id)
    const ids = [
      ...(await run(layer, listSongs(actor, { q: '', page: 1 }))).rows,
      ...(await run(layer, listSongs(actor, { q: '', page: 2 }))).rows,
    ].map((r) => r.id)
    expect(new Set(ids).size).toBe(PAGE_SIZE + 7)
  })

  it('details files with presigned URLs for uploaded ones and their groups', async () => {
    const org = await seedOrg(t.db)
    const s = await seedSong(t.db, org.id, 'Ave')
    const basse = await seedGroup(t.db, org.id, 'Basse')
    const ready = await seedAsset(t.db, s.id, { kind: 'audio', groupIds: [basse.id] })
    const pending = await seedAsset(t.db, s.id, { status: 'uploading' })

    const { assets } = await run(layer, getSongDetail(actorOf(org.id), s.id))
    const byId = new Map(assets.map((a) => [a.id, a]))
    expect(byId.get(ready.id)).toMatchObject({ url: `https://s3.test/get/${ready.storageKey}` })
    expect(byId.get(ready.id)!.groups.map((g) => g.name)).toEqual(['Basse'])
    expect(byId.get(pending.id)!.url).toBeNull()
  })
})

describe('deleteSong', () => {
  it('removes the song, its rows and its objects, tolerating missing objects', async () => {
    const org = await seedOrg(t.db)
    const s = await seedSong(t.db, org.id, 'Ave')
    const keep = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Other')).id)
    const [a, b] = [await seedAsset(t.db, s.id), await seedAsset(t.db, s.id)]
    const removed: Array<string> = []
    const storage = fakeStorage({
      remove: (key) =>
        key === a.storageKey
          ? Effect.fail(new StorageError({ cause: 'NoSuchKey' }))
          : Effect.sync(() => {
              removed.push(key)
            }),
    })

    await run(testLayer(t, { storage }), deleteSong(actorOf(org.id), s.id))
    expect(removed).toEqual([b.storageKey])
    expect((await t.db.select().from(asset)).map((r) => r.id)).toEqual([keep.id])
    expect(await t.db.select().from(song).where(eq(song.id, s.id))).toEqual([])
  })
})
