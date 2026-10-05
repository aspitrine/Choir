import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import type { Db } from '@/shared/infrastructure/db/client'
import { Database } from '@/shared/infrastructure/db/database'
import { FileStorage } from '@/shared/application/file-storage'
import { ValidationError } from '@/shared/domain/errors'
import type { Actor, OrgRole } from '@/features/auth/domain/roles'
import { SessionReader, type Session } from '@/features/auth/application/ports'
import { OrganizationAuthority } from '@/features/organizations/application/ports'
import { DrizzleMembershipRepository } from '@/features/auth/infrastructure/drizzle-membership-repository'
import { DrizzleGroupRepository } from '@/features/groups/infrastructure/drizzle-group-repository'
import { DrizzleMemberRepository } from '@/features/members/infrastructure/drizzle-member-repository'
import { DrizzlePlaylistRepository } from '@/features/playlists/infrastructure/drizzle-playlist-repository'
import { DrizzleShareLinkRepository } from '@/features/sharing/infrastructure/drizzle-share-link-repository'
import { DrizzleAssetRepository } from '@/features/songs/infrastructure/drizzle-asset-repository'
import { DrizzleSongRepository } from '@/features/songs/infrastructure/drizzle-song-repository'

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

// In-process Postgres (WASM) running the real migrations, so use cases are
// exercised with the real Drizzle adapters and SQL, without a server.
export async function createTestDb() {
  const client = new PGlite()
  const pglite = drizzle(client)
  await migrate(pglite, { migrationsFolder })
  // Same query builder API as node-postgres; only the driver type differs.
  const db = pglite as unknown as Db

  const reset = async () => {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    if (rows.length === 0) return
    await pglite.execute(
      sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`),
    )
  }

  return { db, client, reset, layer: Layer.succeed(Database, db) }
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>

export type FakeStorage = FileStorage['Type'] & { removed: Array<string> }

// Deterministic storage double: URLs embed the key so assertions can check them.
export function fakeStorage(overrides: Partial<FileStorage['Type']> = {}): FakeStorage {
  const removed: Array<string> = []
  return {
    removed,
    presignPut: (key) => Effect.succeed(`https://s3.test/put/${key}`),
    presignGet: (key) => Effect.succeed(`https://s3.test/get/${key}`),
    head: () => Effect.succeed({ sizeBytes: 1234, contentType: 'application/pdf' }),
    remove: (key) =>
      Effect.sync(() => {
        removed.push(key)
      }),
    ...overrides,
  }
}

const notConfigured = (name: string) => () => Effect.fail(new ValidationError({ message: `${name} not stubbed` }))

/** Organization authority double: every call fails unless the test provides it. */
export function fakeAuthority(overrides: Partial<OrganizationAuthority['Type']> = {}): OrganizationAuthority['Type'] {
  return {
    createInvitation: notConfigured('createInvitation'),
    acceptInvitation: notConfigured('acceptInvitation'),
    cancelInvitation: notConfigured('cancelInvitation'),
    updateMemberRole: notConfigured('updateMemberRole'),
    removeMember: notConfigured('removeMember'),
    deleteOrganization: notConfigured('deleteOrganization'),
    ...overrides,
  }
}

/** Same wiring as app/runtime.ts, on the test database and with doubles at the edges. */
export function testLayer(
  t: TestDb,
  edges: {
    storage?: FileStorage['Type']
    authority?: OrganizationAuthority['Type']
    session?: Session | null
  } = {},
) {
  const repositories = Layer.mergeAll(
    DrizzleMembershipRepository,
    DrizzleGroupRepository,
    DrizzleSongRepository,
    DrizzleAssetRepository,
    DrizzlePlaylistRepository,
    DrizzleShareLinkRepository,
    DrizzleMemberRepository,
  ).pipe(Layer.provide(t.layer))
  return Layer.mergeAll(
    repositories,
    Layer.succeed(FileStorage, edges.storage ?? fakeStorage()),
    Layer.succeed(OrganizationAuthority, edges.authority ?? fakeAuthority()),
    Layer.succeed(SessionReader, { getSession: () => Effect.succeed(edges.session ?? null) }),
  )
}

type TestServices = Layer.Layer.Success<ReturnType<typeof testLayer>>

/** Runs a use case; resolves with its value or rejects with its typed error. */
export const run = <A, E>(layer: Layer.Layer<TestServices>, effect: Effect.Effect<A, E, TestServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)))

/** Runs a use case expected to fail and resolves with the typed error. */
export const fail = <A, E>(layer: Layer.Layer<TestServices>, effect: Effect.Effect<A, E, TestServices>) =>
  Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(layer)))

/** An actor of `orgId`; owner by default so authorization doesn't get in the way. */
export const actorOf = (orgId: string, role: OrgRole = 'owner', userId = 'user-test'): Actor => ({
  orgId,
  userId,
  role,
})
