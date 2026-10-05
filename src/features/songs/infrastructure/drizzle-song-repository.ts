import { Effect, Layer } from 'effect'
import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { NotFoundError } from '@/shared/domain/errors'
import { PAGE_SIZE, containsPattern } from '@/shared/domain/pagination'
import { SongRepository } from '../application/ports'
import type { CreateSongInput } from '../domain/song'
import { song } from './schema'

const columns = (input: CreateSongInput) => ({
  title: input.title,
  composer: input.composer ?? null,
  arranger: input.arranger ?? null,
  key: input.key ?? null,
  tempo: input.tempo ?? null,
  notes: input.notes ?? null,
})

export const DrizzleSongRepository = Layer.effect(
  SongRepository,
  Effect.map(Database, (db) => {
    const get = (orgId: string, songId: string) =>
      Effect.promise(() =>
        db
          .select()
          .from(song)
          .where(and(eq(song.id, songId), eq(song.organizationId, orgId)))
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: 'song', id: songId })),
        ),
      )

    return {
      list: (orgId, { q, page }) => {
        const pattern = containsPattern(q)
        const where = and(
          eq(song.organizationId, orgId),
          pattern ? or(ilike(song.title, pattern), ilike(song.composer, pattern)) : undefined,
        )
        return Effect.promise(async () => {
          const [rows, [{ total }]] = await Promise.all([
            db
              .select()
              .from(song)
              .where(where)
              // id breaks createdAt ties (bulk imports) so pages never overlap.
              .orderBy(desc(song.createdAt), desc(song.id))
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE),
            db.select({ total: count() }).from(song).where(where),
          ])
          return { rows, total, page, pageSize: PAGE_SIZE }
        })
      },

      listAll: (orgId) =>
        Effect.promise(() =>
          db.select().from(song).where(eq(song.organizationId, orgId)).orderBy(desc(song.createdAt), desc(song.id)),
        ),

      get,

      create: (orgId, input) =>
        Effect.promise(() =>
          db
            .insert(song)
            .values({ id: crypto.randomUUID(), organizationId: orgId, ...columns(input) })
            .returning(),
        ).pipe(Effect.map(([row]) => row!)),

      update: (orgId, songId, input) =>
        get(orgId, songId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .update(song)
                .set({ ...columns(input), updatedAt: new Date() })
                .where(eq(song.id, songId))
                .returning(),
            ),
          ),
          Effect.map(([row]) => row!),
        ),

      remove: (orgId, songId) =>
        get(orgId, songId).pipe(
          Effect.flatMap(() => Effect.promise(() => db.delete(song).where(eq(song.id, songId)))),
          Effect.asVoid,
        ),
    }
  }),
)
