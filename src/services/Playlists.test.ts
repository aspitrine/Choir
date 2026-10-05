import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { Playlists, PlaylistsLive } from './Playlists'
import { NotFoundError, ValidationError } from '../domain/errors'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedOrg, seedPlaylist, seedSong } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<Playlists>>
let fail: ReturnType<typeof failWith<Playlists>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = PlaylistsLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(() => t.reset())

const DAY = 24 * 60 * 60 * 1000
const titles = (items: Array<{ song: { title: string } }>) => items.map((i) => i.song.title)

describe('Playlists', () => {
  it('creates and lists playlists per organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const p = await run(Effect.flatMap(Playlists, (s) => s.create(org.id, 'Noël', 'Messe de minuit')))
    expect(p).toMatchObject({ name: 'Noël', description: 'Messe de minuit' })
    expect(await run(Effect.flatMap(Playlists, (s) => s.list(org.id)))).toHaveLength(1)
    expect(await run(Effect.flatMap(Playlists, (s) => s.list(other.id)))).toEqual([])
    expect(await fail(Effect.flatMap(Playlists, (s) => s.get(other.id, p.id)))).toBeInstanceOf(NotFoundError)
  })

  it('appends songs, reorders and removes items', async () => {
    const org = await seedOrg(t.db)
    const [a, b, c] = [
      await seedSong(t.db, org.id, 'A'),
      await seedSong(t.db, org.id, 'B'),
      await seedSong(t.db, org.id, 'C'),
    ]
    const p = await seedPlaylist(t.db, org.id, 'Concert')
    for (const s of [a, b, c]) await run(Effect.flatMap(Playlists, (pl) => pl.addSong(org.id, p.id, s.id)))

    let items = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    expect(titles(items)).toEqual(['A', 'B', 'C'])
    expect(items.map((i) => i.position)).toEqual([0, 1, 2])

    await run(
      Effect.flatMap(Playlists, (s) => s.reorder(org.id, p.id, [items[2]!.itemId, items[0]!.itemId, items[1]!.itemId])),
    )
    items = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    expect(titles(items)).toEqual(['C', 'A', 'B'])
    expect(items.map((i) => i.position)).toEqual([0, 1, 2])

    await run(Effect.flatMap(Playlists, (s) => s.removeItem(org.id, p.id, items[1]!.itemId)))
    await run(Effect.flatMap(Playlists, (pl) => pl.addSong(org.id, p.id, a.id)))
    items = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    expect(titles(items)).toEqual(['C', 'B', 'A'])
    // Appended after the highest remaining position, not the item count.
    expect(items.at(-1)!.position).toBe(3)
  })

  it('refuses to touch another organization playlist', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const song = await seedSong(t.db, other.id, 'X')
    const p = await seedPlaylist(t.db, org.id, 'P')
    for (const eff of [
      Effect.flatMap(Playlists, (s) => s.addSong(other.id, p.id, song.id)),
      Effect.flatMap(Playlists, (s) => s.listItems(other.id, p.id)),
      Effect.flatMap(Playlists, (s) => s.reorder(other.id, p.id, [])),
      Effect.flatMap(Playlists, (s) => s.addEventDate(other.id, p.id, new Date())),
      Effect.flatMap(Playlists, (s) => s.remove(other.id, p.id)),
    ]) {
      expect(await fail(eff)).toBeInstanceOf(NotFoundError)
    }
  })

  it('manages event dates in chronological order', async () => {
    const org = await seedOrg(t.db)
    const p = await seedPlaylist(t.db, org.id, 'P')
    const later = new Date(Date.now() + 10 * DAY)
    const sooner = new Date(Date.now() + 2 * DAY)
    await run(Effect.flatMap(Playlists, (s) => s.addEventDate(org.id, p.id, later)))
    await run(Effect.flatMap(Playlists, (s) => s.addEventDate(org.id, p.id, sooner)))

    const dates = await run(Effect.flatMap(Playlists, (s) => s.listEventDates(org.id, p.id)))
    expect(dates).toHaveLength(2)
    expect(dates[0]!.eventDate.getTime()).toBeLessThan(dates[1]!.eventDate.getTime())

    await run(Effect.flatMap(Playlists, (s) => s.removeEventDate(org.id, p.id, dates[0]!.id)))
    expect(await run(Effect.flatMap(Playlists, (s) => s.listEventDates(org.id, p.id)))).toHaveLength(1)
  })

  it('lists upcoming playlists: dated soonest first, undated last, past ones hidden', async () => {
    const org = await seedOrg(t.db)
    const undated = await seedPlaylist(t.db, org.id, 'Sans date')
    const past = await seedPlaylist(t.db, org.id, 'Passée')
    const soon = await seedPlaylist(t.db, org.id, 'Bientôt')
    const later = await seedPlaylist(t.db, org.id, 'Plus tard')
    const add = (id: string, offsetDays: number) =>
      run(Effect.flatMap(Playlists, (s) => s.addEventDate(org.id, id, new Date(Date.now() + offsetDays * DAY))))
    await add(past.id, -5)
    await add(soon.id, -5)
    await add(soon.id, 3)
    await add(later.id, 20)

    const upcoming = await run(Effect.flatMap(Playlists, (s) => s.listUpcoming(org.id)))
    expect(upcoming.map((u) => u.playlist.name)).toEqual(['Bientôt', 'Plus tard', 'Sans date'])
    expect(upcoming[0]!.eventDateCount).toBe(2)
    expect(upcoming.find((u) => u.playlist.id === undated.id)).toMatchObject({
      nextEventDate: null,
      eventDateCount: 0,
    })
  })

  it('refuses to add a song of another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const p = await seedPlaylist(t.db, org.id, 'P')
    const foreign = await seedSong(t.db, other.id, 'Secret')

    expect(await fail(Effect.flatMap(Playlists, (s) => s.addSong(org.id, p.id, foreign.id)))).toBeInstanceOf(
      NotFoundError,
    )
    expect(await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))).toEqual([])
  })

  it('rejects a reorder that is not a permutation of the current items', async () => {
    const org = await seedOrg(t.db)
    const [a, b, c] = [
      await seedSong(t.db, org.id, 'A'),
      await seedSong(t.db, org.id, 'B'),
      await seedSong(t.db, org.id, 'C'),
    ]
    const p = await seedPlaylist(t.db, org.id, 'P', [a.id, b.id, c.id])
    const other = await seedPlaylist(t.db, org.id, 'Other', [a.id])
    const items = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    const [otherItem] = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, other.id)))
    const ids = items.map((i) => i.itemId)

    for (const attempt of [
      [ids[2]!, ids[0]!], // partial (stale tab)
      [ids[0]!, ids[0]!, ids[1]!], // duplicate
      [ids[0]!, ids[1]!, otherItem!.itemId], // item of another playlist
      [...ids, ids[0]!],
    ]) {
      const err = await fail(Effect.flatMap(Playlists, (s) => s.reorder(org.id, p.id, attempt)))
      expect(err).toBeInstanceOf(ValidationError)
    }
    const after = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    expect(titles(after)).toEqual(['A', 'B', 'C'])
  })

  it('gives distinct positions to songs added concurrently', async () => {
    const org = await seedOrg(t.db)
    const p = await seedPlaylist(t.db, org.id, 'P')
    const songs = await Promise.all(Array.from({ length: 6 }, (_, i) => seedSong(t.db, org.id, `S${i}`)))

    await Promise.all(songs.map((s) => run(Effect.flatMap(Playlists, (pl) => pl.addSong(org.id, p.id, s.id)))))
    const items = await run(Effect.flatMap(Playlists, (s) => s.listItems(org.id, p.id)))
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
