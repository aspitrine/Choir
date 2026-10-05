import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// No aggregated schema: each feature's repositories import their own tables.
export const db = drizzle(pool)
export type Db = NodePgDatabase
