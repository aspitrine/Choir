import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { eq } from 'drizzle-orm'
import { ShareLinks, ShareLinksLive } from './ShareLinks'
import { NotFoundError } from '../domain/errors'
import { shareLink } from '../db/schema'
import { createTestDb, failWith, runWith } from '../test/db'
import { seedAsset, seedGroup, seedOrg, seedPlaylist, seedSong } from '../test/fixtures'

let t: Awaited<ReturnType<typeof createTestDb>>
let run: ReturnType<typeof runWith<ShareLinks>>
let fail: ReturnType<typeof failWith<ShareLinks>>

beforeAll(async () => {
  t = await createTestDb()
  const layer = ShareLinksLive.pipe(Layer.provide(t.layer))
  run = runWith(layer)
  fail = failWith(layer)
})
beforeEach(() => t.reset())

// A playlist of two songs with files shared to different audiences.
async function choir() {
  const org = await seedOrg(t.db)
  const soprano = await seedGroup(t.db, org.id, 'Soprano')
  const basse = await seedGroup(t.db, org.id, 'Basse')
  const alto = await seedGroup(t.db, org.id, 'Alto')
  const first = await seedSong(t.db, org.id, 'Premier')
  const second = await seedSong(t.db, org.id, 'Second')
  const assets = {
    everyone: await seedAsset(t.db, second.id, { kind: 'score' }),
    sopBasse: await seedAsset(t.db, first.id, { kind: 'audio', groupIds: [soprano.id, basse.id] }),
    basse: await seedAsset(t.db, first.id, { kind: 'audio', groupIds: [basse.id] }),
    alto: await seedAsset(t.db, second.id, { kind: 'audio', groupIds: [alto.id] }),
  }
  // Playlist order is the reverse of creation order to check sorting.
  const playlist = await seedPlaylist(t.db, org.id, 'Concert', [first.id, second.id])
  return { org, groups: { soprano, basse, alto }, assets, playlist }
}

const create = (orgId: string, playlistId: string, groupIds: Array<string> = []) =>
  run(Effect.flatMap(ShareLinks, (s) => s.create(orgId, playlistId, groupIds)))
const resolve = (token: string) => run(Effect.flatMap(ShareLinks, (s) => s.resolvePublic(token)))
const assetIds = (r: Awaited<ReturnType<typeof resolve>>) => r.items.flatMap((i) => i.assets.map((a) => a.id))

describe('ShareLinks', () => {
  it('creates a link with an unguessable token and lists it with its groups', async () => {
    const { org, playlist, groups } = await choir()
    const link = await create(org.id, playlist.id, [groups.basse.id])
    expect(link.token).toMatch(/^[0-9a-f-]{36}$/)

    const links = await run(Effect.flatMap(ShareLinks, (s) => s.list(org.id, playlist.id)))
    expect(links).toHaveLength(1)
    expect(links[0]!.groups.map((g) => g.name)).toEqual(['Basse'])
  })

  it('refuses links on another organization playlist', async () => {
    const { playlist } = await choir()
    const other = await seedOrg(t.db, 'Other')
    const err = await fail(Effect.flatMap(ShareLinks, (s) => s.create(other.id, playlist.id, [])))
    expect(err).toBeInstanceOf(NotFoundError)
    expect(await run(Effect.flatMap(ShareLinks, (s) => s.list(other.id, playlist.id)))).toEqual([])
  })

  it('resolves an unfiltered link to every file, in playlist order', async () => {
    const { org, playlist, assets } = await choir()
    const link = await create(org.id, playlist.id)
    const resolved = await resolve(link.token)

    expect(resolved.playlist.name).toBe('Concert')
    expect(resolved.items.map((i) => i.song.title)).toEqual(['Premier', 'Second'])
    expect(new Set(assetIds(resolved))).toEqual(new Set(Object.values(assets).map((a) => a.id)))
  })

  it('returns each visible asset with its groups sorted by name', async () => {
    const { org, playlist, assets } = await choir()
    const resolved = await resolve((await create(org.id, playlist.id)).token)
    const all = resolved.items.flatMap((i) => i.assets)
    const groupsOf = (id: string) => all.find((a) => a.id === id)!.groups.map((g) => g.name)

    expect(groupsOf(assets.everyone.id)).toEqual([])
    expect(groupsOf(assets.sopBasse.id)).toEqual(['Basse', 'Soprano'])
    expect(groupsOf(assets.basse.id)).toEqual(['Basse'])
  })

  it('filters a group link to files tagged with that group plus untagged files', async () => {
    const { org, playlist, assets, groups } = await choir()
    const resolved = await resolve((await create(org.id, playlist.id, [groups.basse.id])).token)
    expect(new Set(assetIds(resolved))).toEqual(
      new Set([assets.everyone.id, assets.sopBasse.id, assets.basse.id]),
    )
    // Songs stay listed even when all their files are filtered out.
    expect(resolved.items).toHaveLength(2)
  })

  it('combines several groups on one link', async () => {
    const { org, playlist, assets, groups } = await choir()
    const resolved = await resolve((await create(org.id, playlist.id, [groups.soprano.id, groups.alto.id])).token)
    expect(new Set(assetIds(resolved))).toEqual(new Set([assets.everyone.id, assets.sopBasse.id, assets.alto.id]))
  })

  it('rejects unknown, revoked and expired tokens', async () => {
    const { org, playlist } = await choir()
    expect(await fail(Effect.flatMap(ShareLinks, (s) => s.resolvePublic('nope')))).toBeInstanceOf(NotFoundError)

    const revoked = await create(org.id, playlist.id)
    await run(Effect.flatMap(ShareLinks, (s) => s.revoke(org.id, revoked.id)))
    expect(await fail(Effect.flatMap(ShareLinks, (s) => s.resolvePublic(revoked.token)))).toBeInstanceOf(
      NotFoundError,
    )

    const expired = await create(org.id, playlist.id)
    await t.db
      .update(shareLink)
      .set({ expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) })
      .where(eq(shareLink.id, expired.id))
    expect(await fail(Effect.flatMap(ShareLinks, (s) => s.resolvePublic(expired.token)))).toBeInstanceOf(
      NotFoundError,
    )
  })

  it('only lets the owning organization revoke a link', async () => {
    const { org, playlist } = await choir()
    const other = await seedOrg(t.db, 'Other')
    const link = await create(org.id, playlist.id)
    expect(await fail(Effect.flatMap(ShareLinks, (s) => s.revoke(other.id, link.id)))).toBeInstanceOf(NotFoundError)
    await resolve(link.token)
  })

  it('refuses a link filtered on a group of another organization', async () => {
    const { org, playlist } = await choir()
    const foreign = await seedGroup(t.db, (await seedOrg(t.db, 'Other')).id, 'Theirs')
    const err = await fail(Effect.flatMap(ShareLinks, (s) => s.create(org.id, playlist.id, [foreign.id])))
    expect(err).toBeInstanceOf(NotFoundError)
    expect(await run(Effect.flatMap(ShareLinks, (s) => s.list(org.id, playlist.id)))).toEqual([])
  })

  it('lists links with their own groups only', async () => {
    const { org, playlist, groups } = await choir()
    const a = await create(org.id, playlist.id, [groups.basse.id])
    const b = await create(org.id, playlist.id, [groups.alto.id, groups.soprano.id])
    const links = await run(Effect.flatMap(ShareLinks, (s) => s.list(org.id, playlist.id)))
    const byId = new Map(links.map((l) => [l.link.id, l.groups.map((g) => g.name).sort()]))
    expect(byId.get(a.id)).toEqual(['Basse'])
    expect(byId.get(b.id)).toEqual(['Alto', 'Soprano'])
  })
})

