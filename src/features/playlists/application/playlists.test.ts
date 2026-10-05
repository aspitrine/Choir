import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, run, testLayer, type TestDb } from '@/test/db'
import { seedOrg, seedPlaylist, seedSong } from '@/test/fixtures'
import {
  addEventDate,
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistDetail,
  listPlaylists,
  listUpcomingPlaylists,
  removeEventDate,
  removePlaylistItem,
  reorderPlaylist,
} from './playlists'

let t: TestDb
let layer: ReturnType<typeof testLayer>
beforeAll(async () => {
  t = await createTestDb()
  layer = testLayer(t)
})
beforeEach(() => t.reset())

const DAY = 24 * 60 * 60 * 1000
const titles = (items: Array<{ song: { title: string } }>) => items.map((i) => i.song.title)

describe('playlists', () => {
  it('creates and lists playlists per choir', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = actorOf((await seedOrg(t.db, 'B')).id)
    const p = await run(layer, createPlaylist(actorOf(org.id), { name: 'Noël', description: 'Messe de minuit' }))
    expect(p).toMatchObject({ name: 'Noël', description: 'Messe de minuit' })
    expect(await run(layer, listPlaylists(actorOf(org.id)))).toHaveLength(1)
    expect(await run(layer, listPlaylists(other))).toEqual([])
    expect(await fail(layer, getPlaylistDetail(other, p.id))).toBeInstanceOf(NotFoundError)
  })

  it('appends songs, reorders and removes items', async () => {
    const org = await seedOrg(t.db)
    const actor = actorOf(org.id)
    const songs = [await seedSong(t.db, org.id, 'A'), await seedSong(t.db, org.id, 'B'), await seedSong(t.db, org.id, 'C')]
    const p = await seedPlaylist(t.db, org.id, 'Concert')
    for (const s of songs) await run(layer, addSongToPlaylist(actor, p.id, s.id))

    let { items } = await run(layer, getPlaylistDetail(actor, p.id))
    expect(titles(items)).toEqual(['A', 'B', 'C'])

    await run(layer, reorderPlaylist(actor, p.id, [items[2]!.itemId, items[0]!.itemId, items[1]!.itemId]))
    ;({ items } = await run(layer, getPlaylistDetail(actor, p.id)))
    expect(titles(items)).toEqual(['C', 'A', 'B'])
    expect(items.map((i) => i.position)).toEqual([0, 1, 2])

    await run(layer, removePlaylistItem(actor, p.id, items[1]!.itemId))
    await run(layer, addSongToPlaylist(actor, p.id, songs[0]!.id))
    ;({ items } = await run(layer, getPlaylistDetail(actor, p.id)))
    expect(titles(items)).toEqual(['C', 'B', 'A'])
    expect(items.at(-1)!.position).toBe(3)
  })

  it('gives distinct positions to songs added concurrently', async () => {
    const org = await seedOrg(t.db)
    const p = await seedPlaylist(t.db, org.id, 'P')
    const songs = await Promise.all(Array.from({ length: 6 }, (_, i) => seedSong(t.db, org.id, `S${i}`)))
    await Promise.all(songs.map((s) => run(layer, addSongToPlaylist(actorOf(org.id), p.id, s.id))))
    const { items } = await run(layer, getPlaylistDetail(actorOf(org.id), p.id))
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('refuses a song of another choir (it would leak through share links)', async () => {
    const org = await seedOrg(t.db, 'A')
    const foreign = await seedSong(t.db, (await seedOrg(t.db, 'B')).id, 'Secret')
    const p = await seedPlaylist(t.db, org.id, 'P')
    expect(await fail(layer, addSongToPlaylist(actorOf(org.id), p.id, foreign.id))).toBeInstanceOf(NotFoundError)
  })

  it('rejects a reorder that is not a permutation of the current items', async () => {
    const org = await seedOrg(t.db)
    const songs = [await seedSong(t.db, org.id, 'A'), await seedSong(t.db, org.id, 'B'), await seedSong(t.db, org.id, 'C')]
    const p = await seedPlaylist(t.db, org.id, 'P', songs.map((s) => s.id))
    const ids = (await run(layer, getPlaylistDetail(actorOf(org.id), p.id))).items.map((i) => i.itemId)

    const err = await fail(layer, reorderPlaylist(actorOf(org.id), p.id, [ids[2]!, ids[0]!]))
    expect(err).toBeInstanceOf(ValidationError)
    expect(titles((await run(layer, getPlaylistDetail(actorOf(org.id), p.id))).items)).toEqual(['A', 'B', 'C'])
  })

  it('refuses writes from members and from other choirs', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = actorOf((await seedOrg(t.db, 'B')).id)
    const singer = actorOf(org.id, 'member')
    const song = await seedSong(t.db, org.id, 'X')
    const p = await seedPlaylist(t.db, org.id, 'P')
    for (const [actor, error] of [
      [singer, ForbiddenError],
      [other, NotFoundError],
    ] as const) {
      expect(await fail(layer, addSongToPlaylist(actor, p.id, song.id))).toBeInstanceOf(error)
      expect(await fail(layer, reorderPlaylist(actor, p.id, []))).toBeInstanceOf(error)
      expect(await fail(layer, addEventDate(actor, p.id, new Date()))).toBeInstanceOf(error)
      expect(await fail(layer, deletePlaylist(actor, p.id))).toBeInstanceOf(error)
    }
    expect(await fail(layer, createPlaylist(singer, { name: 'X', description: null }))).toBeInstanceOf(ForbiddenError)
  })

  it('manages event dates and lists upcoming playlists', async () => {
    const org = await seedOrg(t.db)
    const actor = actorOf(org.id)
    await seedPlaylist(t.db, org.id, 'Sans date')
    const past = await seedPlaylist(t.db, org.id, 'Passée')
    const soon = await seedPlaylist(t.db, org.id, 'Bientôt')
    const add = (id: string, days: number) => run(layer, addEventDate(actor, id, new Date(Date.now() + days * DAY)))
    await add(past.id, -5)
    await add(soon.id, 3)
    await add(soon.id, 10)

    const { eventDates } = await run(layer, getPlaylistDetail(actor, soon.id))
    expect(eventDates[0]!.eventDate.getTime()).toBeLessThan(eventDates[1]!.eventDate.getTime())
    expect((await run(layer, listUpcomingPlaylists(actor))).map((u) => u.playlist.name)).toEqual([
      'Bientôt',
      'Sans date',
    ])

    await run(layer, removeEventDate(actor, soon.id, eventDates[0]!.id))
    expect((await run(layer, getPlaylistDetail(actor, soon.id))).eventDates).toHaveLength(1)
  })
})
