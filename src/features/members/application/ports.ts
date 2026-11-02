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
    /** A pending invitation of the organization. */
    readonly findPendingInvitation: (orgId: string, invitationId: string) => Effect.Effect<Invitation | null>
    /** Whether the email belongs to a member of the organization or to another of its pending invitations. */
    readonly isEmailInOrg: (orgId: string, email: string, exceptInvitationId: string) => Effect.Effect<boolean>
    /** Updates a pending invitation of the organization and replaces its groups; false if there is none. */
    readonly updatePendingInvitation: (
      orgId: string,
      invitationId: string,
      details: {
        firstName: string | null
        lastName: string | null
        email: string
        /** A new link secret, when the old link must stop working. */
        secret?: string
        role: string
        groupIds: ReadonlyArray<string>
      },
    ) => Effect.Effect<boolean>
    /** The member's account, its role here and how many choirs it belongs to. */
    readonly findMemberAccount: (
      orgId: string,
      memberId: string,
    ) => Effect.Effect<{ userId: string; role: string; name: string; email: string; orgCount: number } | null>
    /** Whether another account already uses this email. */
    readonly isEmailTaken: (email: string, exceptUserId: string) => Effect.Effect<boolean>
    /** Renames the account and, if given, changes its email (to verify again). */
    readonly updateAccount: (userId: string, details: { name: string; email?: string }) => Effect.Effect<void>
    /** The invite link's secret, Better Auth's status (pending, accepted, canceled…) and the invitee's name. */
    readonly findInvitationLink: (
      invitationId: string,
    ) => Effect.Effect<{ secret: string | null; status: string; firstName: string | null; lastName: string | null } | null>
    /** Whether this member row is the user's own, created by accepting this invitation. */
    readonly isAcceptedBy: (userId: string, memberId: string, invitationId: string) => Effect.Effect<boolean>
    /** Grants the invitation's groups to the member (idempotent). */
    readonly grantInvitationGroups: (invitationId: string, memberId: string) => Effect.Effect<void>
  }
>() {}
