import { Effect, Layer } from 'effect'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { NotFoundError } from '@/shared/domain/errors'
import { song } from '@/features/songs/infrastructure/schema'
import { PlaylistRepository } from '../application/ports'
import { nextPosition } from '../domain/ordering'
import { playlist, playlistEventDate, playlistItem } from './schema'

export const DrizzlePlaylistRepository = Layer.effect(
  PlaylistRepository,
  Effect.map(Database, (db) => ({
    list: (orgId) =>
      Effect.promise(() =>
        db
          .select()
          .from(playlist)
          .where(eq(playlist.organizationId, orgId))
          .orderBy(desc(playlist.createdAt), desc(playlist.id)),
      ),

    get: (orgId, playlistId) =>
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
      ),

    create: (orgId, { name, description }) =>
      Effect.promise(() =>
        db.insert(playlist).values({ id: crypto.randomUUID(), organizationId: orgId, name, description }).returning(),
      ).pipe(Effect.map(([row]) => row!)),

    remove: (playlistId) =>
      Effect.promise(() => db.delete(playlist).where(eq(playlist.id, playlistId))).pipe(Effect.asVoid),

    listItems: (playlistId) =>
      Effect.promise(() =>
        db
          .select({ itemId: playlistItem.id, position: playlistItem.position, song })
          .from(playlistItem)
          .innerJoin(song, eq(song.id, playlistItem.songId))
          .where(eq(playlistItem.playlistId, playlistId))
          .orderBy(asc(playlistItem.position)),
      ),

    itemIds: (playlistId) =>
      Effect.promise(() =>
        db.select({ id: playlistItem.id }).from(playlistItem).where(eq(playlistItem.playlistId, playlistId)),
      ).pipe(Effect.map((rows) => rows.map((r) => r.id))),

    appendSong: (playlistId, songId) =>
      Effect.promise(() =>
        db.transaction(async (tx) => {
          // Lock the playlist so two concurrent appends can't both pick the same
          // next position (unique index → one of them would fail).
          await tx.select({ id: playlist.id }).from(playlist).where(eq(playlist.id, playlistId)).for('update')
          const existing = await tx
            .select({ position: playlistItem.position })
            .from(playlistItem)
            .where(eq(playlistItem.playlistId, playlistId))
          await tx.insert(playlistItem).values({
            id: crypto.randomUUID(),
            playlistId,
            songId,
            position: nextPosition(existing.map((r) => r.position)),
          })
        }),
      ),

    removeItem: (playlistId, itemId) =>
      Effect.promise(() =>
        db.delete(playlistItem).where(and(eq(playlistItem.id, itemId), eq(playlistItem.playlistId, playlistId))),
      ).pipe(Effect.asVoid),

    reorder: (playlistId, itemIdsInOrder) =>
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

    listEventDates: (playlistId) =>
      Effect.promise(() =>
        db
          .select()
          .from(playlistEventDate)
          .where(eq(playlistEventDate.playlistId, playlistId))
          .orderBy(asc(playlistEventDate.eventDate)),
      ),

    addEventDate: (playlistId, eventDate) =>
      Effect.promise(() =>
        db.insert(playlistEventDate).values({ id: crypto.randomUUID(), playlistId, eventDate }),
      ).pipe(Effect.asVoid),

    removeEventDate: (playlistId, eventDateId) =>
      Effect.promise(() =>
        db
          .delete(playlistEventDate)
          .where(and(eq(playlistEventDate.id, eventDateId), eq(playlistEventDate.playlistId, playlistId))),
      ).pipe(Effect.asVoid),

    listWithEventDates: (orgId) =>
      Effect.promise(async () => {
        const playlists = await db.select().from(playlist).where(eq(playlist.organizationId, orgId))
        const ids = playlists.map((p) => p.id)
        const dates =
          ids.length > 0
            ? await db.select().from(playlistEventDate).where(inArray(playlistEventDate.playlistId, ids))
            : []
        return { playlists, dates }
      }),
  })),
)
