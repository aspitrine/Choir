import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { Client, Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'
import * as schema from '../src/db/schema'
import { E2E_DATABASE_URL, director } from './env'

async function ensureDatabase() {
  const target = new URL(E2E_DATABASE_URL)
  const dbName = target.pathname.slice(1)
  const admin = new URL(E2E_DATABASE_URL)
  admin.pathname = '/postgres'
  const client = new Client({ connectionString: admin.toString() })
  await client.connect()
  const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [dbName])
  if (!rowCount) await client.query(`create database "${dbName}"`)
  await client.end()
}

// Fresh schema + one director who owns one choir, before every run.
export default async function globalSetup() {
  await ensureDatabase()
  const pool = new Pool({ connectionString: E2E_DATABASE_URL })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })

  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`,
  )
  await db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`))

  const userId = crypto.randomUUID()
  const orgId = crypto.randomUUID()
  await db.insert(schema.user).values({
    id: userId,
    name: director.name,
    email: director.email,
    emailVerified: true,
  })
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: await hashPassword(director.password),
  })
  await db.insert(schema.organization).values({ id: orgId, name: director.org, slug: 'chorale-e2e' })
  await db.insert(schema.member).values({ id: crypto.randomUUID(), organizationId: orgId, userId, role: 'owner' })

  await pool.end()
}
