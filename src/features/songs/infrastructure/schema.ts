import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { organization } from '../../auth/infrastructure/schema'
import { group } from '../../groups/infrastructure/schema'

export const assetKind = pgEnum('asset_kind', ['score', 'audio'])

export const assetStatus = pgEnum('asset_status', ['uploading', 'ready', 'failed'])

export const song = pgTable('song', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  composer: text('composer'),
  arranger: text('arranger'),
  key: text('key'),
  tempo: text('tempo'),
  notes: text('notes'),
  // Set once at creation when this song was copied from another org's catalog.
  // No sync after import: editing the copy never touches the source.
  importedFromSongId: text('imported_from_song_id'),
  importedFromOrgId: text('imported_from_org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const asset = pgTable('asset', {
  id: text('id').primaryKey(),
  songId: text('song_id')
    .notNull()
    .references(() => song.id, { onDelete: 'cascade' }),
  kind: assetKind('kind').notNull(),
  // Display label, e.g. "Basse 2" or a score edition name. Voice/section is
  // expressed purely through group tags, not a fixed field here.
  label: text('label'),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  durationMs: integer('duration_ms'),
  status: assetStatus('status').notNull().default('uploading'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Tags an asset with a group. A share link filtered on groups only shows
// assets tagged with at least one of them; an untagged asset (or an
// unfiltered link) is always visible — see shareLinkGroup.
export const assetGroup = pgTable(
  'asset_group',
  {
    assetId: text('asset_id')
      .notNull()
      .references(() => asset.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => group.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.groupId] })],
)
