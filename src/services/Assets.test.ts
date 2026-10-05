import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { eq } from 'drizzle-orm'
import { Assets, AssetsLive } from './Assets'
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
  contentType: 'audio/mpeg',
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
})
