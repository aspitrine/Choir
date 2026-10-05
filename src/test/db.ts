import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'
import { Effect, Layer } from 'effect'
import * as schema from '../db/schema'
import type { Db } from '../db/client'
import { Database } from '../services/Database'
import { Storage } from '../services/Storage'

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

// In-process Postgres (WASM) running the real migrations, so service tests
// exercise the same SQL as production without a server.
export async function createTestDb() {
  const client = new PGlite()
  const pglite = drizzle(client, { schema })
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

export type FakeStorage = Storage['Type'] & { removed: Array<string> }

// Deterministic storage double: URLs embed the key so assertions can check them.
export function fakeStorage(overrides: Partial<Storage['Type']> = {}): FakeStorage {
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

export const storageLayer = (storage: Storage['Type']) => Layer.succeed(Storage, storage)

/** Runs an effect against a layer, returning its value or rejecting with its typed error. */
export const runWith =
  <R>(layer: Layer.Layer<R>) =>
  <A, E>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)))

/** Runs an effect expected to fail and returns the typed error. */
export const failWith =
  <R>(layer: Layer.Layer<R>) =>
  <A, E>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(layer)))
