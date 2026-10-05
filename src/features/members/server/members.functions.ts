import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { PageParams } from '@/shared/domain/pagination'
import { GroupIds, Id } from '@/shared/domain/schemas'
import { decodeInput, requestHeaders } from '@/shared/server/request'
import { runServer, withActor } from '@/app/runtime'
import { requireSession } from '@/features/auth/application/access'
import { AssignableRole } from '@/features/auth/domain/roles'
import { CreateInviteInput } from '../domain/invitation'
import {
  acceptInvite,
  createInvite,
  removeMember,
  revokeInvite,
  searchInvitations,
  searchMembers,
  updateMemberGroups,
  updateMemberRole,
} from '../application/members'

const ByMember = Schema.Struct({ memberId: Id })

export const searchMembersFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(PageParams))
  .handler(({ data }) => withActor((actor) => searchMembers(actor, data)))

export const searchInvitationsFn = createServerFn({ method: 'GET' })
  .validator(decodeInput(PageParams))
  .handler(({ data }) => withActor((actor) => searchInvitations(actor, data)))

export const createInviteFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreateInviteInput))
  .handler(({ data }) => withActor((actor) => createInvite(actor, data)))

export const revokeInviteFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ invitationId: Id })))
  .handler(({ data }) => withActor((actor) => revokeInvite(actor, data.invitationId)))

export const updateMemberRoleFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ memberId: Id, role: AssignableRole })))
  .handler(({ data }) => withActor((actor) => updateMemberRole(actor, data.memberId, data.role)))

export const updateMemberGroupsFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ memberId: Id, groupIds: GroupIds })))
  .handler(({ data }) => withActor((actor) => updateMemberGroups(actor, data.memberId, data.groupIds)))

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByMember))
  .handler(({ data }) => withActor((actor) => removeMember(actor, data.memberId)))

// The invitee isn't a member yet: only a session is required.
export const acceptInvitationFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ invitationId: Id, secret: Schema.String.pipe(Schema.maxLength(200)) })))
  .handler(({ data }) =>
    runServer(
      Effect.flatMap(requireSession(requestHeaders()), (session) =>
        acceptInvite(session.userId, data.invitationId, data.secret),
      ),
    ),
  )
