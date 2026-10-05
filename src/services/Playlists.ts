import { Context, Effect, Layer } from 'effect'
import { eq, and, asc, desc, inArray } from 'drizzle-orm'
import { Database } from './Database'
import { playlist, playlistItem, playlistEventDate, song } from '../db/schema'
import { NotFoundError, ValidationError } from '../domain/errors'

export interface UpcomingPlaylist {
  playlist: typeof playlist.$inferSelect
  nextEventDate: Date | null
  eventDateCount: number
}

export class Playlists extends Context.Tag('Playlists')<
  Playlists,
  {
    readonly list: (orgId: string) => Effect.Effect<Array<typeof playlist.$inferSelect>>
    readonly get: (
      orgId: string,
      playlistId: string,
    ) => Effect.Effect<typeof playlist.$inferSelect, NotFoundError>
    readonly create: (
      orgId: string,
      name: string,
      description: string | null,
    ) => Effect.Effect<typeof playlist.$inferSelect>
    readonly remove: (orgId: string, playlistId: string) => Effect.Effect<void, NotFoundError>
    readonly listItems: (
      orgId: string,
      playlistId: string,
    ) => Effect.Effect<
      Array<{ itemId: string; position: number; song: typeof song.$inferSelect }>,
      NotFoundError
    >
    /** The song must belong to the same organization as the playlist. */
    readonly addSong: (
      orgId: string,
      playlistId: string,
      songId: string,
    ) => Effect.Effect<void, NotFoundError>
    readonly removeItem: (
      orgId: string,
      playlistId: string,
      itemId: string,
    ) => Effect.Effect<void, NotFoundError>
    /** `itemIdsInOrder` must list every item of the playlist exactly once. */
    readonly reorder: (
      orgId: string,
      playlistId: string,
      itemIdsInOrder: ReadonlyArray<string>,
    ) => Effect.Effect<void, NotFoundError | ValidationError>
    readonly listEventDates: (
      orgId: string,
      playlistId: string,
    ) => Effect.Effect<Array<typeof playlistEventDate.$inferSelect>, NotFoundError>
    readonly addEventDate: (
      orgId: string,
      playlistId: string,
      eventDate: Date,
    ) => Effect.Effect<void, NotFoundError>
    readonly removeEventDate: (
      orgId: string,
      playlistId: string,
      eventDateId: string,
    ) => Effect.Effect<void, NotFoundError>
    /** Playlists with no event dates, or with at least one date still in the future — soonest first. */
    readonly listUpcoming: (orgId: string) => Effect.Effect<Array<UpcomingPlaylist>>
  }
>() {}

export const PlaylistsLive = Layer.effect(
  Playlists,
  Effect.gen(function* () {
    const db = yield* Database

    const get = (orgId: string, playlistId: string) =>
      Effect.promise(() =>
        db
          .select()
          .from(playlist)
          .where(and(eq(playlist.id, playlistId), eq(playlist.organizationId, orgId)))
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row) : Effect.fail(new NotFoundError({ entity: 'playlist', id: playlistId })),
        ),
      )

    return {
      list: (orgId) =>
        Effect.promise(() =>
          db
            .select()
            .from(playlist)
            .where(eq(playlist.organizationId, orgId))
            .orderBy(desc(playlist.createdAt), desc(playlist.id)),
        ),
      get,
      create: (orgId, name, description) =>
        Effect.promise(() =>
          db
            .insert(playlist)
            .values({ id: crypto.randomUUID(), organizationId: orgId, name, description })
            .returning(),
        ).pipe(Effect.map(([row]) => row!)),
      remove: (orgId, playlistId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() => Effect.promise(() => db.delete(playlist).where(eq(playlist.id, playlistId)))),
          Effect.asVoid,
        ),
      listItems: (orgId, playlistId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .select({ itemId: playlistItem.id, position: playlistItem.position, song })
                .from(playlistItem)
                .innerJoin(song, eq(song.id, playlistItem.songId))
                .where(eq(playlistItem.playlistId, playlistId))
                .orderBy(asc(playlistItem.position)),
            ),
          ),
        ),
      addSong: (orgId, playlistId, songId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .select({ id: song.id })
                .from(song)
                .where(and(eq(song.id, songId), eq(song.organizationId, orgId)))
                .limit(1),
            ),
          ),
          Effect.flatMap(([row]) =>
            row ? Effect.void : Effect.fail(new NotFoundError({ entity: 'song', id: songId })),
          ),
          Effect.flatMap(() =>
            Effect.promise(() =>
              db.transaction(async (tx) => {
                // Lock the playlist so two concurrent adds can't both pick the same
                // next position (unique index → one of them would fail).
                await tx.select({ id: playlist.id }).from(playlist).where(eq(playlist.id, playlistId)).for('update')
                const existing = await tx
                  .select({ position: playlistItem.position })
                  .from(playlistItem)
                  .where(eq(playlistItem.playlistId, playlistId))
                const nextPosition = existing.reduce((max, r) => Math.max(max, r.position), -1) + 1
                await tx.insert(playlistItem).values({
                  id: crypto.randomUUID(),
                  playlistId,
                  songId,
                  position: nextPosition,
                })
              }),
            ),
          ),
          Effect.asVoid,
        ),
      removeItem: (orgId, playlistId, itemId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db.delete(playlistItem).where(and(eq(playlistItem.id, itemId), eq(playlistItem.playlistId, playlistId))),
            ),
          ),
          Effect.asVoid,
        ),
      reorder: (orgId, playlistId, itemIdsInOrder) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .select({ id: playlistItem.id })
                .from(playlistItem)
                .where(eq(playlistItem.playlistId, playlistId)),
            ),
          ),
          Effect.flatMap((current) => {
            // A partial or duplicated list would leave positions colliding with
            // untouched items (unique index) — e.g. a stale tab after an add.
            const requested = new Set(itemIdsInOrder)
            const isPermutation =
              requested.size === itemIdsInOrder.length &&
              requested.size === current.length &&
              current.every((r) => requested.has(r.id))
            return isPermutation
              ? Effect.void
              : Effect.fail(new ValidationError({ message: 'La playlist a changé, rechargez la page' }))
          }),
          Effect.flatMap(() =>
            Effect.promise(() =>
              db.transaction(async (tx) => {
                // Shift into a disjoint range first so the unique (playlistId, position) index never collides mid-update.
                for (const [index, itemId] of itemIdsInOrder.entries()) {
                  await tx
                    .update(playlistItem)
                    .set({ position: -(index + 1) })
                    .where(and(eq(playlistItem.id, itemId), eq(playlistItem.playlistId, playlistId)))
                }
                for (const [index, itemId] of itemIdsInOrder.entries()) {
                  await tx
                    .update(playlistItem)
                    .set({ position: index })
                    .where(and(eq(playlistItem.id, itemId), eq(playlistItem.playlistId, playlistId)))
                }
              }),
            ),
          ),
          Effect.asVoid,
        ),
      listEventDates: (orgId, playlistId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .select()
                .from(playlistEventDate)
                .where(eq(playlistEventDate.playlistId, playlistId))
                .orderBy(asc(playlistEventDate.eventDate)),
            ),
          ),
        ),
      addEventDate: (orgId, playlistId, eventDate) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db.insert(playlistEventDate).values({ id: crypto.randomUUID(), playlistId, eventDate }),
            ),
          ),
          Effect.asVoid,
        ),
      removeEventDate: (orgId, playlistId, eventDateId) =>
        get(orgId, playlistId).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              db
                .delete(playlistEventDate)
                .where(
                  and(eq(playlistEventDate.id, eventDateId), eq(playlistEventDate.playlistId, playlistId)),
                ),
            ),
          ),
          Effect.asVoid,
        ),
      listUpcoming: (orgId) =>
        Effect.promise(async () => {
          const playlists = await db.select().from(playlist).where(eq(playlist.organizationId, orgId))
          const playlistIds = playlists.map((p) => p.id)
          const dates =
            playlistIds.length > 0
              ? await db
                  .select()
                  .from(playlistEventDate)
                  .where(inArray(playlistEventDate.playlistId, playlistIds))
              : []

          const now = new Date()
          const result: Array<UpcomingPlaylist> = []
          for (const p of playlists) {
            const datesForPlaylist = dates.filter((d) => d.playlistId === p.id)
            const futureDates = datesForPlaylist
              .map((d) => d.eventDate)
              .filter((d) => d >= now)
              .sort((a, b) => a.getTime() - b.getTime())

            if (datesForPlaylist.length === 0) {
              result.push({ playlist: p, nextEventDate: null, eventDateCount: 0 })
            } else if (futureDates.length > 0) {
              result.push({
                playlist: p,
                nextEventDate: futureDates[0]!,
                eventDateCount: datesForPlaylist.length,
              })
            }
          }

          result.sort((a, b) => {
            if (a.nextEventDate && b.nextEventDate) return a.nextEventDate.getTime() - b.nextEventDate.getTime()
            if (a.nextEventDate) return -1
            if (b.nextEventDate) return 1
            return 0
          })

          return result
        }),
    }
  }),
)
