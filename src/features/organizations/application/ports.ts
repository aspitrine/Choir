import { Context, type Effect } from 'effect'
import type { ValidationError } from '@/shared/domain/errors'
import type { AssignableRole } from '@/features/auth/domain/roles'

/**
 * Port: the system of record for organizations, memberships and invitations
 * (Better Auth). It enforces its own rules — e.g. an owner can't be demoted or
 * removed by an admin — and acts as the current request's user.
 */
export class OrganizationAuthority extends Context.Tag('OrganizationAuthority')<
  OrganizationAuthority,
  {
    readonly createInvitation: (invitation: {
      orgId: string
      email: string
      role: AssignableRole
      firstName: string | null
      lastName: string | null
    }) => Effect.Effect<{ id: string }, ValidationError>
    readonly acceptInvitation: (invitationId: string) => Effect.Effect<{ memberId: string }, ValidationError>
    readonly cancelInvitation: (invitationId: string) => Effect.Effect<void, ValidationError>
    readonly updateMemberRole: (orgId: string, memberId: string, role: AssignableRole) => Effect.Effect<void, ValidationError>
    readonly removeMember: (orgId: string, memberId: string) => Effect.Effect<void, ValidationError>
    readonly deleteOrganization: (orgId: string) => Effect.Effect<void, ValidationError>
  }
>() {}
