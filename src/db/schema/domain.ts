import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { organization, member, invitation } from './auth'

export const assetKind = pgEnum('asset_kind', ['score', 'audio'])
export const assetStatus = pgEnum('asset_status', ['uploading', 'ready', 'failed'])

export const group = pgTable(
  'group',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('group_org_slug_unique').on(t.organizationId, t.slug)],
)

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

// Groups granted to a pending invitation; copied into memberGroup on acceptance
// (no member row exists yet for a pending invite).
export const invitationGroup = pgTable(
  'invitation_group',
  {
    invitationId: text('invitation_id')
      .notNull()
      .references(() => invitation.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => group.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.invitationId, t.groupId] })],
)

export const memberGroup = pgTable(
  'member_group',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => member.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => group.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.groupId] })],
)

export const playlist = pgTable('playlist', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
  eventDate: timestamp('event_date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const shareLink = pgTable('share_link', {
  id: text('id').primaryKey(),
  playlistId: text('playlist_id')
    .notNull()
    .references(() => playlist.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
