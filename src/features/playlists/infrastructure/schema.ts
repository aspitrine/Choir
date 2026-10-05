import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization } from '../../auth/infrastructure/schema'
import { song } from '../../songs/infrastructure/schema'

export const playlist = pgTable('playlist', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const playlistItem = pgTable(
  'playlist_item',
  {
    id: text('id').primaryKey(),
    playlistId: text('playlist_id')
      .notNull()
      .references(() => playlist.id, { onDelete: 'cascade' }),
    songId: text('song_id')
      .notNull()
      .references(() => song.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (t) => [uniqueIndex('playlist_item_order_unique').on(t.playlistId, t.position)],
)

// A playlist can have zero or more event dates. Zero dates = always shown
// as upcoming on the dashboard; one or more = shown until the last one passes.
export const playlistEventDate = pgTable('playlist_event_date', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id')
    .notNull()
    .references(() => playlist.id, { onDelete: 'cascade' }),
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
