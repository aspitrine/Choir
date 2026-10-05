import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { eq, inArray } from 'drizzle-orm'
import { ForbiddenError, NotFoundError, StorageError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, fakeStorage, run, testLayer, type FakeStorage, type TestDb } from '@/test/db'
import { seedAsset, seedGroup, seedOrg, seedSong } from '@/test/fixtures'
import { asset, assetGroup } from '../infrastructure/schema'
import { confirmUpload, createUploadIntent, deleteAsset, purgeStaleUploads, setAssetGroups } from './assets'

let t: TestDb
let storage: FakeStorage
const layer = () => testLayer(t, { storage })
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
const DAY = 24 * 3600 * 1000

describe('createUploadIntent', () => {
  it('reserves a pending asset under a choir-scoped key, with its groups', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const basse = await seedGroup(t.db, org.id, 'Basse')

    const { assetId, uploadUrl } = await run(layer(), createUploadIntent(actorOf(org.id), intent(song.id, [basse.id])))
    const key = `org/${org.id}/song/${song.id}/${assetId}-basse.mp3`
    expect(uploadUrl).toBe(`https://s3.test/put/${key}`)
    const [row] = await t.db.select().from(asset).where(eq(asset.id, assetId))
    expect(row).toMatchObject({ status: 'uploading', storageKey: key, label: 'Basse', kind: 'audio' })
    expect(await t.db.select().from(assetGroup)).toEqual([{ assetId, groupId: basse.id }])
  })

  it('refuses members, songs of another choir and foreign groups', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const song = await seedSong(t.db, org.id, 'Ave')
    const foreignSong = await seedSong(t.db, other.id, 'X')
    const foreignGroup = await seedGroup(t.db, other.id, 'Theirs')

    expect(await fail(layer(), createUploadIntent(actorOf(org.id, 'member'), intent(song.id)))).toBeInstanceOf(
      ForbiddenError,
    )
    expect(await fail(layer(), createUploadIntent(actorOf(org.id), intent(foreignSong.id)))).toBeInstanceOf(
      NotFoundError,
    )
    expect(
      await fail(layer(), createUploadIntent(actorOf(org.id), intent(song.id, [foreignGroup.id]))),
    ).toBeInstanceOf(NotFoundError)
    expect(await t.db.select().from(asset)).toEqual([])
  })

  it('purges uploads abandoned for over a day on the way', async () => {
    const org = await seedOrg(t.db)
    const song = await seedSong(t.db, org.id, 'Ave')
    const stale = await seedAsset(t.db, song.id, { status: 'uploading' })
    await t.db.update(asset).set({ createdAt: new Date(Date.now() - 2 * DAY) }).where(eq(asset.id, stale.id))

    await run(layer(), createUploadIntent(actorOf(org.id), intent(song.id)))
    expect(storage.removed).toEqual([stale.storageKey])
    expect((await t.db.select().from(asset)).map((r) => r.id)).not.toContain(stale.id)
  })
})

describe('purgeStaleUploads', () => {
  it('only purges uploads of this choir that are still pending past the cutoff', async () => {
    const org = await seedOrg(t.db, 'A')
    const other = await seedOrg(t.db, 'B')
    const song = await seedSong(t.db, org.id, 'Ave')
    const stale = await seedAsset(t.db, song.id, { status: 'uploading' })
    const fresh = await seedAsset(t.db, song.id, { status: 'uploading' })
    const readyOld = await seedAsset(t.db, song.id, { status: 'ready' })
    const otherStale = await seedAsset(t.db, (await seedSong(t.db, other.id, 'X')).id, { status: 'uploading' })
    await t.db
      .update(asset)
      .set({ createdAt: new Date(Date.now() - 2 * DAY) })
      .where(inArray(asset.id, [stale.id, readyOld.id, otherStale.id]))

    expect(await run(layer(), purgeStaleUploads(org.id, new Date(Date.now() - DAY)))).toBe(1)
    expect(storage.removed).toEqual([stale.storageKey])
    expect((await t.db.select().from(asset)).map((r) => r.id).sort()).toEqual(
      [fresh.id, readyOld.id, otherStale.id].sort(),
    )
  })
})

describe('confirmUpload', () => {
  it('marks the asset ready with the stored size and type', async () => {
    const org = await seedOrg(t.db)
    const a = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id, { status: 'uploading' })
    storage = fakeStorage({ head: () => Effect.succeed({ sizeBytes: 42, contentType: 'application/pdf' }) })
    expect(await run(layer(), confirmUpload(actorOf(org.id), a.id))).toMatchObject({
      status: 'ready',
      sizeBytes: 42,
      mimeType: 'application/pdf',
    })
  })

  it('keeps the asset pending when the object is missing', async () => {
    const org = await seedOrg(t.db)
    const a = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id, { status: 'uploading' })
    storage = fakeStorage({ head: () => Effect.fail(new StorageError({ cause: 'NoSuchKey' })) })
    expect(await fail(layer(), confirmUpload(actorOf(org.id), a.id))).toBeInstanceOf(StorageError)
    expect((await t.db.select().from(asset).where(eq(asset.id, a.id)))[0]!.status).toBe('uploading')
  })
})

describe('deleteAsset and setAssetGroups', () => {
  it('removes the object then the row', async () => {
    const org = await seedOrg(t.db)
    const a = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id)
    await run(layer(), deleteAsset(actorOf(org.id), a.id))
    expect(storage.removed).toEqual([a.storageKey])
    expect(await t.db.select().from(asset)).toEqual([])
  })

  it('replaces group tags, only with groups of the choir', async () => {
    const org = await seedOrg(t.db)
    const a = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id)
    const [sop, alt] = [await seedGroup(t.db, org.id, 'Soprano'), await seedGroup(t.db, org.id, 'Alto')]
    const foreign = await seedGroup(t.db, (await seedOrg(t.db, 'B')).id, 'Theirs')

    await run(layer(), setAssetGroups(actorOf(org.id), a.id, [sop.id]))
    await run(layer(), setAssetGroups(actorOf(org.id), a.id, [alt.id]))
    expect((await t.db.select().from(assetGroup)).map((r) => r.groupId)).toEqual([alt.id])
    expect(await fail(layer(), setAssetGroups(actorOf(org.id), a.id, [foreign.id]))).toBeInstanceOf(NotFoundError)
    expect((await t.db.select().from(assetGroup)).map((r) => r.groupId)).toEqual([alt.id])
  })

  it('never touches a file of another choir', async () => {
    const org = await seedOrg(t.db, 'A')
    const a = await seedAsset(t.db, (await seedSong(t.db, (await seedOrg(t.db, 'B')).id, 'X')).id)
    expect(await fail(layer(), deleteAsset(actorOf(org.id), a.id))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer(), setAssetGroups(actorOf(org.id), a.id, []))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer(), confirmUpload(actorOf(org.id), a.id))).toBeInstanceOf(NotFoundError)
    expect(storage.removed).toEqual([])
  })
})
