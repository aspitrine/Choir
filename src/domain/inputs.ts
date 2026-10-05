import { Schema } from 'effect'
import { GroupIds, Id } from './songs'

// Runtime validation for server function payloads: TypeScript types vanish at
// the network boundary, so every field coming from the client is checked here.

// Typed on the encoded shape so callers keep compile-time checks; the payload
// is still decoded as unknown since a client can send anything.
export const decodeInput =
  <A, I>(schema: Schema.Schema<A, I>) =>
  (data: I): A =>
    Schema.decodeUnknownSync(schema)(data)

const Name = (max: number) =>
  Schema.Trim.pipe(Schema.minLength(1, { message: () => 'Le nom est requis' }), Schema.maxLength(max))

export const ByAsset = Schema.Struct({ assetId: Id })
export const BySong = Schema.Struct({ songId: Id })
export const ByGroup = Schema.Struct({ groupId: Id })
export const ByPlaylist = Schema.Struct({ playlistId: Id })
export const ByShareLink = Schema.Struct({ shareLinkId: Id })
export const ByInvitation = Schema.Struct({ invitationId: Id })
export const ByMember = Schema.Struct({ memberId: Id })

export const PublicToken = Schema.Struct({ token: Id })
export const PublicAssetUrls = Schema.Struct({ token: Id, assetIds: Schema.Array(Id).pipe(Schema.maxItems(500)) })

export const CreateGroupInput = Schema.Struct({ name: Name(60) })
export const SetAssetGroupsInput = Schema.Struct({ assetId: Id, groupIds: GroupIds })

export const CreatePlaylistInput = Schema.Struct({
  name: Name(120),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(2000))),
})
export const PlaylistSongInput = Schema.Struct({ playlistId: Id, songId: Id })
export const PlaylistItemInput = Schema.Struct({ playlistId: Id, itemId: Id })
export const ReorderPlaylistInput = Schema.Struct({
  playlistId: Id,
  itemIdsInOrder: Schema.Array(Id).pipe(Schema.maxItems(1000)),
})
export const AddEventDateInput = Schema.Struct({
  playlistId: Id,
  // Rejects strings that don't parse to a real date (new Date('x') is Invalid Date).
  eventDate: Schema.Date,
})
export const RemoveEventDateInput = Schema.Struct({ playlistId: Id, eventDateId: Id })

export const CreateShareLinkInput = Schema.Struct({ playlistId: Id, groupIds: GroupIds })

// 'owner' is never assignable through the app: only the choir creator holds it.
export const InviteRole = Schema.Literal('admin', 'member')

const OptionalName = Schema.NullOr(Schema.String.pipe(Schema.maxLength(100)))

export const CreateInviteInput = Schema.Struct({
  email: Schema.Trim.pipe(
    Schema.maxLength(254),
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => 'Email invalide' }),
  ),
  firstName: OptionalName,
  lastName: OptionalName,
  role: InviteRole,
  groupIds: GroupIds,
})
export const UpdateMemberRoleInput = Schema.Struct({ memberId: Id, role: InviteRole })
export const UpdateMemberGroupsInput = Schema.Struct({ memberId: Id, groupIds: GroupIds })
export const AcceptInvitationInput = Schema.Struct({ invitationId: Id, secret: Schema.String.pipe(Schema.maxLength(200)) })
