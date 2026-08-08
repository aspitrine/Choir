import { Context, Effect, Layer } from 'effect'
import { eq, and, desc, ilike, or, count } from 'drizzle-orm'
import { Database } from './Database'
import { song, asset } from '../db/schema'
import { NotFoundError } from '../domain/errors'
import type { CreateSongInput } from '../domain/songs'
import { PAGE_SIZE, type Page } from '../domain/pagination'

export class Songs extends Context.Tag('Songs')<
  Songs,
  {
    readonly list: (
      orgId: string,
      params: { q: string; page: number },
    ) => Effect.Effect<Page<typeof song.$inferSelect>>
    /** Full unpaginated list — for pickers (e.g. adding a song to a playlist). */
    readonly listAll: (orgId: string) => Effect.Effect<Array<typeof song.$inferSelect>>
    readonly get: (
      orgId: string,
      songId: string,
    ) => Effect.Effect<typeof song.$inferSelect, NotFoundError>
    readonly create: (
      orgId: string,
      input: CreateSongInput,
    ) => Effect.Effect<typeof song.$inferSelect>
    readonly update: (
      orgId: string,
      songId: string,
      input: CreateSongInput,
    ) => Effect.Effect<typeof song.$inferSelect, NotFoundError>
    readonly remove: (orgId: string, songId: string) => Effect.Effect<void, NotFoundError>
    readonly listAssets: (
      orgId: string,
      songId: string,
    ) => Effect.Effect<Array<typeof asset.$inferSelect>, NotFoundError>
  }
>() {}

export const SongsLive = Layer.effect(
  Songs,
  Effect.gen(function* () {
    const db = yield* Database

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
        const where = and(
          eq(song.organizationId, orgId),
          q.trim() ? or(ilike(song.title, `%${q.trim()}%`), ilike(song.composer, `%${q.trim()}%`)) : undefined,
        )
        return Effect.promise(async () => {
          const [rows, [{ total }]] = await Promise.all([
            db
              .select()
              .from(song)
              .where(where)
              .orderBy(desc(song.createdAt))
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE),
            db.select({ total: count() }).from(song).where(where),
          ])
          return { rows, total, page, pageSize: PAGE_SIZE }
        })
      },
      listAll: (orgId) =>
        Effect.promise(() =>
          db.select().from(song).where(eq(song.organizationId, orgId)).orderBy(desc(song.createdAt)),
        ),
      get,
      create: (orgId, input) =>
        Effect.promise(() =>
          db
            .insert(song)
            .values({
              id: crypto.randomUUID(),
              organizationId: orgId,
              title: input.title,
              composer: input.composer ?? null,
              arranger: input.arranger ?? null,
              key: input.key ?? null,
              tempo: input.tempo ?? null,
              notes: input.notes ?? null,
            })
            .returning(),
        ).pipe(Effect.map(([row]) => row!)),
      update: (orgId, songId, input) =>
        get(orgId, songId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .update(song)
                .set({
                  title: input.title,
                  composer: input.composer ?? null,
                  arranger: input.arranger ?? null,
                  key: input.key ?? null,
                  tempo: input.tempo ?? null,
                  notes: input.notes ?? null,
                  updatedAt: new Date(),
                })
                .where(eq(song.id, songId))
                .returning(),
            ),
          ),
          Effect.map(([row]) => row!),
        ),
      remove: (orgId, songId) =>
        get(orgId, songId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() => db.delete(song).where(eq(song.id, songId))),
          ),
          Effect.asVoid,
        ),
      listAssets: (orgId, songId) =>
        get(orgId, songId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() => db.select().from(asset).where(eq(asset.songId, songId))),
          ),
        ),
    }
  }),
)
