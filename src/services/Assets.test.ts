import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { eq } from 'drizzle-orm'
import { Assets, AssetsLive, safeFilename } from './Assets'
import { NotFoundError, StorageError } from '../domain/errors'
import { asset } from '../db/schema'
import { createTestDb, fakeStorage, failWith, runWith, storageLayer, type FakeStorage } from '../test/db'
import { seedAsset, seedGroup, seedOrg, seedSong } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let storage: FakeStorage
const layer = () => AssetsLive.pipe(Layer.provide(Layer.mergeAll(t.layer, storageLayer(storage))))
const run = <A, E>(eff: Effect.Effect<A, E, Assets>) => runWith(layer())(eff)
const fail = <A, E>(eff: Effect.Effect<A, E, Assets>) => failWith(layer())(eff)

beforeAll(async () => {
  t = await createTestDb()
})
beforeEach(async () => {
  storage = fakeStorage()
  await t.reset()
})

const intent = (songId: string, groupIds: Array<string> = []) => ({
  songId,
  kind: 'audio' as const,
  label: 'Basse',
  filename: 'basse.mp3',
  contentType: 'audio/mpeg' as const,
  groupIds,
})

describe('Assets', () => {
  it('creates an upload intent with a scoped storage key and group tags', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const basse = await seedGroup(t.db, org.id, 'Basse')

    const { assetId, uploadUrl } = await run(
      Effect.flatMap(Assets, (a) => a.createUploadIntent(org.id, intent(song.id, [basse.id]))),
    )
    const expectedKey = `org/${org.id}/song/${song.id}/${assetId}-basse.mp3`
    expect(uploadUrl).toBe(`https://s3.test/put/${expectedKey}`)

    const [row] = await t.db.select().from(asset).where(eq(asset.id, assetId))
    expect(row).toMatchObject({ status: 'uploading', storageKey: expectedKey, label: 'Basse', kind: 'audio' })
    const groups = await run(Effect.flatMap(Assets, (a) => a.getGroups(org.id, assetId)))
    expect(groups.map((g) => g.name)).toEqual(['Basse'])
  })

  it('rejects an upload for a song of another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const song = await seedSong(t.db, other.id, 'X')
    const err = await fail(Effect.flatMap(Assets, (a) => a.createUploadIntent(org.id, intent(song.id))))
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it('confirms an upload using the stored object metadata', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const a = await seedAsset(t.db, song.id, { status: 'uploading', mimeType: 'application/octet-stream' })
    storage = fakeStorage({ head: () => Effect.succeed({ sizeBytes: 42, contentType: 'application/pdf' }) })

    const confirmed = await run(Effect.flatMap(Assets, (s) => s.confirmUpload(org.id, a.id)))
    expect(confirmed).toMatchObject({ status: 'ready', sizeBytes: 42, mimeType: 'application/pdf' })
  })

  it('keeps the asset uploading when the object is missing', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const a = await seedAsset(t.db, song.id, { status: 'uploading' })
    storage = fakeStorage({ head: () => Effect.fail(new StorageError({ cause: 'NoSuchKey' })) })

    expect(await fail(Effect.flatMap(Assets, (s) => s.confirmUpload(org.id, a.id)))).toBeInstanceOf(StorageError)
    const [row] = await t.db.select().from(asset).where(eq(asset.id, a.id))
    expect(row!.status).toBe('uploading')
  })

  it('removes the stored object then the row', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const a = await seedAsset(t.db, song.id)

    await run(Effect.flatMap(Assets, (s) => s.remove(org.id, a.id)))
    expect(storage.removed).toEqual([a.storageKey])
    expect(await t.db.select().from(asset)).toEqual([])
  })

  it('never touches an asset of another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const song = await seedSong(t.db, other.id, 'X')
    const a = await seedAsset(t.db, song.id)

    expect(await fail(Effect.flatMap(Assets, (s) => s.remove(org.id, a.id)))).toBeInstanceOf(NotFoundError)
    expect(await fail(Effect.flatMap(Assets, (s) => s.setGroups(org.id, a.id, [])))).toBeInstanceOf(NotFoundError)
    expect(storage.removed).toEqual([])
  })

  it('replaces group tags and lists them per song', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const [sop, alt] = [await seedGroup(t.db, org.id, 'Soprano'), await seedGroup(t.db, org.id, 'Alto')]
    const a = await seedAsset(t.db, song.id, { groupIds: [sop.id] })

    await run(Effect.flatMap(Assets, (s) => s.setGroups(org.id, a.id, [alt.id])))
    const tags = await run(Effect.flatMap(Assets, (s) => s.listGroupsForSong(song.id)))
    expect(tags.map((r) => [r.assetId, r.group.name])).toEqual([[a.id, 'Alto']])

    await run(Effect.flatMap(Assets, (s) => s.setGroups(org.id, a.id, [])))
    expect(await run(Effect.flatMap(Assets, (s) => s.getGroups(org.id, a.id)))).toEqual([])
  })

  it('lists storage keys of one organization only', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const mine = await seedAsset(t.db, (await seedSong(t.db, org.id, 'A')).id)
    await seedAsset(t.db, (await seedSong(t.db, other.id, 'B')).id)
    expect(await run(Effect.flatMap(Assets, (s) => s.listStorageKeysForOrg(org.id)))).toEqual([mine.storageKey])
  })

  it('refuses tagging with a group of another organization', async () => {
    const org = await seedOrg(t.db, 'A')
    const song = await seedSong(t.db, org.id, 'Ave')
    const a = await seedAsset(t.db, song.id)
    const foreign = await seedGroup(t.db, (await seedOrg(t.db, 'B')).id, 'Theirs')

    expect(await fail(Effect.flatMap(Assets, (s) => s.setGroups(org.id, a.id, [foreign.id])))).toBeInstanceOf(
      NotFoundError,
    )
    expect(
      await fail(Effect.flatMap(Assets, (s) => s.createUploadIntent(org.id, intent(song.id, [foreign.id])))),
    ).toBeInstanceOf(NotFoundError)
    expect(await t.db.select().from(asset)).toHaveLength(1)
  })

  it('keeps uploaded file names from shaping the storage key', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const { assetId } = await run(
      Effect.flatMap(Assets, (a) => a.createUploadIntent(org.id, { ...intent(song.id), filename: '../../../Église é.mp3' })),
    )
    const [row] = await t.db.select().from(asset).where(eq(asset.id, assetId))
    expect(row!.storageKey).toBe(`org/${org.id}/song/${song.id}/${assetId}-Eglise_e.mp3`)
  })

  it('removes every object and row of a song, tolerating missing objects', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const keep = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Other')).id)
    const [a, b] = [await seedAsset(t.db, song.id), await seedAsset(t.db, song.id)]
    const removed: Array<string> = []
    storage = fakeStorage({
      remove: (key) =>
        key === a.storageKey
          ? Effect.fail(new StorageError({ cause: 'NoSuchKey' }))
          : Effect.sync(() => {
              removed.push(key)
            }),
    })

    await run(Effect.flatMap(Assets, (s) => s.removeAllForSong(org.id, song.id)))
    expect(removed).toEqual([b.storageKey])
    expect((await t.db.select().from(asset)).map((r) => r.id)).toEqual([keep.id])
  })

  it('handles a song without files and refuses another organization song', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const empty = await seedSong(t.db, org.id, 'Vide')
    await run(Effect.flatMap(Assets, (s) => s.removeAllForSong(org.id, empty.id)))

    const foreign = await seedSong(t.db, other.id, 'X')
    await seedAsset(t.db, foreign.id)
    expect(await fail(Effect.flatMap(Assets, (s) => s.removeAllForSong(org.id, foreign.id)))).toBeInstanceOf(
      NotFoundError,
    )
    expect(storage.removed).toEqual([])
    expect(await t.db.select().from(asset)).toHaveLength(1)
  })
})

describe('safeFilename', () => {
  it.each([
    ['basse.mp3', 'basse.mp3'],
    ['Ave Maria (Basse 2).pdf', 'Ave_Maria_Basse_2_.pdf'],
    ['../../etc/passwd', 'etc_passwd'],
    ['.hidden', 'hidden'],
    ['Chœur à 4 voix.mp3', 'Ch_ur_a_4_voix.mp3'],
    ['???', 'file'],
  ])('%s → %s', (input, expected) => {
    expect(safeFilename(input)).toBe(expected)
  })

  it('caps the length while keeping the extension', () => {
    const name = safeFilename(`${'a'.repeat(300)}.mp3`)
    expect(name.length).toBe(120)
    expect(name.endsWith('.mp3')).toBe(true)
  })
})
