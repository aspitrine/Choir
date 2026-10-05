import {
  pgTable,
  text,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { invitation, member } from '../../auth/infrastructure/schema'
import { group } from '../../groups/infrastructure/schema'

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
