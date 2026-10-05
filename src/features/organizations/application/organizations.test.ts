import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { Effect } from 'effect'
import { ForbiddenError, ValidationError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, fakeAuthority, fakeStorage, run, testLayer, type TestDb } from '@/test/db'
import { seedAsset, seedOrg, seedSong } from '@/test/fixtures'
import { deleteOrganization } from './organizations'

let t: TestDb
beforeAll(async () => {
  t = await createTestDb()
})
beforeEach(() => t.reset())

describe('deleteOrganization', () => {
  it('deletes the choir, then its stored files', async () => {
    const org = await seedOrg(t.db)
    const a = await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id)
    const other = await seedAsset(t.db, (await seedSong(t.db, (await seedOrg(t.db, 'B')).id, 'X')).id)
    const storage = fakeStorage()
    const deleteOrg = vi.fn(() => Effect.sync(() => expect(storage.removed).toEqual([])))

    await run(testLayer(t, { storage, authority: fakeAuthority({ deleteOrganization: deleteOrg }) }), deleteOrganization(actorOf(org.id)))
    expect(deleteOrg).toHaveBeenCalledWith(org.id)
    expect(storage.removed).toEqual([a.storageKey])
    expect(storage.removed).not.toContain(other.storageKey)
  })

  it('keeps every file when the deletion is refused', async () => {
    const org = await seedOrg(t.db)
    await seedAsset(t.db, (await seedSong(t.db, org.id, 'Ave')).id)
    const storage = fakeStorage()
    const authority = fakeAuthority({ deleteOrganization: () => Effect.fail(new ValidationError({ message: 'refused' })) })
    expect(await fail(testLayer(t, { storage, authority }), deleteOrganization(actorOf(org.id)))).toBeInstanceOf(ValidationError)
    expect(storage.removed).toEqual([])
  })

  it('is reserved to the owner', async () => {
    const org = await seedOrg(t.db)
    expect(await fail(testLayer(t), deleteOrganization(actorOf(org.id, 'admin')))).toBeInstanceOf(ForbiddenError)
  })
})
