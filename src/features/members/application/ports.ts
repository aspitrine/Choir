import { Context, type Effect } from 'effect'
import type { Page, PageParams } from '@/shared/domain/pagination'
import type { Group } from '@/features/groups/application/ports'
import type { Invitation, Member } from '../domain/member'

export type MemberRow = {
  member: Member
  user: { id: string; name: string; email: string }
  groups: Array<Group>
}
export type InvitationRow = { invitation: Invitation; groups: Array<Group> }

/** Port: members and pending invitations of a choir, with their group grants. */
export class MemberRepository extends Context.Tag('MemberRepository')<
  MemberRepository,
  {
    readonly search: (orgId: string, params: PageParams) => Effect.Effect<Page<MemberRow>>
    readonly searchPendingInvitations: (orgId: string, params: PageParams) => Effect.Effect<Page<InvitationRow>>
    /** The member's user id, only if the member belongs to the organization. */
    readonly findUserId: (orgId: string, memberId: string) => Effect.Effect<string | null>
    readonly replaceGroups: (memberId: string, groupIds: ReadonlyArray<string>) => Effect.Effect<void>
    readonly saveInvitation: (
      invitationId: string,
      details: { secret: string; groupIds: ReadonlyArray<string> },
    ) => Effect.Effect<void>
    readonly findInvitationSecret: (invitationId: string) => Effect.Effect<string | null>
    /** Whether this member row is the user's own, created by accepting this invitation. */
    readonly isAcceptedBy: (userId: string, memberId: string, invitationId: string) => Effect.Effect<boolean>
    /** Grants the invitation's groups to the member (idempotent). */
    readonly grantInvitationGroups: (invitationId: string, memberId: string) => Effect.Effect<void>
  }
>() {}
