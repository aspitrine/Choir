import {
  pgTable,
  text,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { playlist } from '../../playlists/infrastructure/schema'
import { group } from '../../groups/infrastructure/schema'

export const shareLink = pgTable('share_link', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id')
    .notNull()
    .references(() => playlist.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Multiple groups can filter one share link; no rows = everything visible.
export const shareLinkGroup = pgTable(
  'share_link_group',
  {
    shareLinkId: text('share_link_id')
      .notNull()
      .references(() => shareLink.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => group.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.shareLinkId, t.groupId] })],
)
