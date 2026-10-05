import type { Db } from '@/shared/infrastructure/db/client'
import * as authSchema from '@/features/auth/infrastructure/schema'
import * as groupsSchema from '@/features/groups/infrastructure/schema'
import * as songsSchema from '@/features/songs/infrastructure/schema'
import * as playlistsSchema from '@/features/playlists/infrastructure/schema'

const schema = { ...authSchema, ...groupsSchema, ...songsSchema, ...playlistsSchema }

const id = () => crypto.randomUUID()

export async function seedUser(db: Db, overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const userId = overrides.id ?? id()
  const [row] = await db
    .insert(schema.user)
    .values({ id: userId, name: 'Test User', email: `${userId}@test.local`, ...overrides })
    .returning()
  return row!
}

export async function seedOrg(db: Db, name = 'Chorale Test') {
  const orgId = id()
  const [row] = await db
    .insert(schema.organization)
    .values({ id: orgId, name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${orgId.slice(0, 6)}` })
    .returning()
  return row!
}

export async function seedMember(db: Db, orgId: string, userId: string, role: 'owner' | 'admin' | 'member') {
  const [row] = await db
    .insert(schema.member)
    .values({ id: id(), organizationId: orgId, userId, role })
    .returning()
  return row!
}

export async function seedSong(db: Db, orgId: string, title: string) {
  const [row] = await db.insert(schema.song).values({ id: id(), organizationId: orgId, title }).returning()
  return row!
}

export async function seedGroup(db: Db, orgId: string, name: string) {
  const [row] = await db
    .insert(schema.group)
    .values({ id: id(), organizationId: orgId, name, slug: `${name.toLowerCase()}-${id().slice(0, 6)}` })
    .returning()
  return row!
}

export async function seedAsset(
  db: Db,
  songId: string,
  opts: {
    kind?: 'score' | 'audio'
    label?: string | null
    mimeType?: string
    status?: 'uploading' | 'ready' | 'failed'
    groupIds?: Array<string>
  } = {},
) {
  const assetId = id()
  const kind = opts.kind ?? 'score'
  const [row] = await db
    .insert(schema.asset)
    .values({
      id: assetId,
      songId,
      kind,
      label: opts.label ?? null,
      storageKey: `key/${assetId}`,
      mimeType: opts.mimeType ?? (kind === 'score' ? 'application/pdf' : 'audio/mpeg'),
      status: opts.status ?? 'ready',
    })
    .returning()
  if (opts.groupIds?.length) {
    await db.insert(schema.assetGroup).values(opts.groupIds.map((groupId) => ({ assetId, groupId })))
  }
  return row!
}

export async function seedPlaylist(db: Db, orgId: string, name: string, songIds: Array<string> = []) {
  const [row] = await db
    .insert(schema.playlist)
    .values({ id: id(), organizationId: orgId, name })
    .returning()
  if (songIds.length > 0) {
    await db
      .insert(schema.playlistItem)
      .values(songIds.map((songId, position) => ({ id: id(), playlistId: row!.id, songId, position })))
  }
  return row!
}
