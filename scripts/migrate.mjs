import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
console.log('Migrations applied.')

await pool.end()
