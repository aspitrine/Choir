import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { ForbiddenError, NotFoundError } from '@/shared/domain/errors'
import { actorOf, createTestDb, fail, run, testLayer, type TestDb } from '@/test/db'
import { seedAsset, seedGroup, seedOrg, seedPlaylist, seedSong } from '@/test/fixtures'
import { song } from '@/features/songs/infrastructure/schema'
import { shareLink } from '../infrastructure/schema'
import {
  createShareLink,
  getPublicAssetUrls,
  getPublicPlaylist,
  listShareLinks,
  resolvePublicPlaylist,
  revokeShareLink,
} from './sharing'

let t: TestDb
let layer: ReturnType<typeof testLayer>
beforeAll(async () => {
  t = await createTestDb()
  layer = testLayer(t)
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
  const playlist = await seedPlaylist(t.db, org.id, 'Concert', [first.id, second.id])
  return { org, actor: actorOf(org.id), groups: { soprano, basse, alto }, assets, playlist }
}

const ids = (r: Awaited<ReturnType<typeof resolve>>) => new Set(r.items.flatMap((i) => i.assets.map((a) => a.id)))
const resolve = (token: string) => run(layer, resolvePublicPlaylist(token))
const create = async (actor: ReturnType<typeof actorOf>, playlistId: string, groupIds: Array<string> = []) =>
  run(layer, createShareLink(actor, playlistId, groupIds))

describe('managing share links', () => {
  it('creates a link with an unguessable token and lists it with its groups', async () => {
    const { actor, playlist, groups } = await choir()
    const link = await create(actor, playlist.id, [groups.basse.id])
    expect(link.token).toMatch(/^[0-9a-f-]{36}$/)
    const links = await run(layer, listShareLinks(actor, playlist.id))
    expect(links.map((l) => l.groups.map((g) => g.name))).toEqual([['Basse']])
  })

  it('refuses members, playlists of other choirs and foreign groups', async () => {
    const { org, actor, playlist } = await choir()
    const other = actorOf((await seedOrg(t.db, 'Other')).id)
    const foreign = await seedGroup(t.db, other.orgId, 'Theirs')
    expect(await fail(layer, createShareLink(actorOf(org.id, 'member'), playlist.id, []))).toBeInstanceOf(ForbiddenError)
    expect(await fail(layer, createShareLink(other, playlist.id, []))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, listShareLinks(other, playlist.id))).toBeInstanceOf(NotFoundError)
    expect(await fail(layer, createShareLink(actor, playlist.id, [foreign.id]))).toBeInstanceOf(NotFoundError)
    expect(await run(layer, listShareLinks(actor, playlist.id))).toEqual([])
  })

  it('only lets the owning choir revoke a link', async () => {
    const { actor, playlist } = await choir()
    const link = await create(actor, playlist.id)
    const other = actorOf((await seedOrg(t.db, 'Other')).id)
    expect(await fail(layer, revokeShareLink(other, link.id))).toBeInstanceOf(NotFoundError)
    await resolve(link.token)
    await run(layer, revokeShareLink(actor, link.id))
    expect(await fail(layer, resolvePublicPlaylist(link.token))).toBeInstanceOf(NotFoundError)
  })
})

describe('public access', () => {
  it('resolves an unfiltered link to every file, in playlist order', async () => {
    const { actor, playlist, assets } = await choir()
    const resolved = await resolve((await create(actor, playlist.id)).token)
    expect(resolved.playlist).toEqual({ name: 'Concert', description: null })
    expect(resolved.items.map((i) => i.song.title)).toEqual(['Premier', 'Second'])
    expect(ids(resolved)).toEqual(new Set(Object.values(assets).map((a) => a.id)))
  })

  it('filters a group link to its groups plus untagged files', async () => {
    const { actor, playlist, assets, groups } = await choir()
    expect(ids(await resolve((await create(actor, playlist.id, [groups.basse.id])).token))).toEqual(
      new Set([assets.everyone.id, assets.sopBasse.id, assets.basse.id]),
    )
    expect(ids(await resolve((await create(actor, playlist.id, [groups.soprano.id, groups.alto.id])).token))).toEqual(
      new Set([assets.everyone.id, assets.sopBasse.id, assets.alto.id]),
    )
  })

  it('tags each file with its groups sorted by name', async () => {
    const { actor, playlist, assets } = await choir()
    const resolved = await resolve((await create(actor, playlist.id)).token)
    const all = resolved.items.flatMap((i) => i.assets)
    expect(all.find((a) => a.id === assets.sopBasse.id)!.groups.map((g) => g.name)).toEqual(['Basse', 'Soprano'])
    expect(all.find((a) => a.id === assets.everyone.id)!.groups).toEqual([])
  })

  it('exposes only public fields and fully uploaded files', async () => {
    const { org, actor, playlist } = await choir()
    await t.db.update(song).set({ notes: 'Ne pas diffuser : soliste malade' })
    const [first] = await t.db.select().from(song).where(eq(song.title, 'Premier'))
    const pending = await seedAsset(t.db, first!.id, { status: 'uploading' })
    const token = (await create(actor, playlist.id)).token

    const page = await run(layer, getPublicPlaylist(token))
    expect(Object.keys(page.items[0]!.song).sort()).toEqual(['arranger', 'composer', 'id', 'key', 'tempo', 'title'])
    expect(Object.keys(page.items[0]!.assets[0]!).sort()).toEqual(['groups', 'id', 'kind', 'label', 'mimeType', 'status', 'url'])
    const json = JSON.stringify(page)
    expect(json).not.toContain('soliste malade')
    expect(json).not.toContain(org.id)
    expect(json).not.toContain(pending.id)
  })

  it('rejects unknown, revoked and expired tokens', async () => {
    const { actor, playlist } = await choir()
    expect(await fail(layer, resolvePublicPlaylist('nope'))).toBeInstanceOf(NotFoundError)
    const expired = await create(actor, playlist.id)
    await t.db
      .update(shareLink)
      .set({ expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) })
      .where(eq(shareLink.id, expired.id))
    expect(await fail(layer, resolvePublicPlaylist(expired.token))).toBeInstanceOf(NotFoundError)
  })

  it('renews URLs only for files visible through the token', async () => {
    const { actor, playlist, assets, groups } = await choir()
    const token = (await create(actor, playlist.id, [groups.alto.id])).token
    const urls = await run(layer, getPublicAssetUrls(token, [assets.alto.id, assets.basse.id, 'unknown']))
    expect(urls).toEqual({ [assets.alto.id]: `https://s3.test/get/${assets.alto.storageKey}` })
  })
})
