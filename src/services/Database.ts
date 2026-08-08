import { Context, Layer } from 'effect'
import { db, type Db } from '../db/client'

export class Database extends Context.Tag('Database')<Database, Db>() {}

export const DatabaseLive = Layer.succeed(Database, db)
