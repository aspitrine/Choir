import { Effect } from 'effect'
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/domain/errors'
import type { PageParams } from '@/shared/domain/pagination'
import { requireManager } from '@/features/auth/application/access'
import type { Actor, AssignableRole } from '@/features/auth/domain/roles'
import { requireOrgGroups } from '@/features/groups/application/groups'
import { OrganizationAuthority } from '@/features/organizations/application/ports'
import { generateInvitationSecret, secretsMatch, type CreateInviteInput } from '../domain/invitation'
import { MemberRepository } from './ports'

// Member rows carry emails, pending invitations carry invite secrets: managers only.
export const searchMembers = (actor: Actor, params: PageParams) =>
  requireManager(actor).pipe(Effect.zipRight(Effect.flatMap(MemberRepository, (m) => m.search(actor.orgId, params))))

export const searchInvitations = (actor: Actor, params: PageParams) =>
  requireManager(actor).pipe(
    Effect.zipRight(Effect.flatMap(MemberRepository, (m) => m.searchPendingInvitations(actor.orgId, params))),
  )

/** Creates the invitation and returns what the invite link needs (id + secret). */
export const createInvite = (actor: Actor, input: CreateInviteInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    // Checked before creating anything.
    const groupIds = yield* requireOrgGroups(actor.orgId, input.groupIds)
    const authority = yield* OrganizationAuthority
    const members = yield* MemberRepository
    const { id } = yield* authority.createInvitation({
      orgId: actor.orgId,
      email: input.email,
      role: input.role,
      firstName: input.firstName,
      lastName: input.lastName,
    })
    const secret = generateInvitationSecret()
    yield* members.saveInvitation(id, { secret, groupIds })
    return { id, secret }
  })

export const revokeInvite = (actor: Actor, invitationId: string) =>
  requireManager(actor).pipe(
    Effect.zipRight(Effect.flatMap(OrganizationAuthority, (authority) => authority.cancelInvitation(invitationId))),
  )

export const updateMemberRole = (actor: Actor, memberId: string, role: AssignableRole) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const members = yield* MemberRepository
    if ((yield* members.findUserId(actor.orgId, memberId)) === actor.userId) {
      return yield* Effect.fail(new ValidationError({ message: 'Vous ne pouvez pas modifier votre propre rôle' }))
    }
    yield* Effect.flatMap(OrganizationAuthority, (authority) => authority.updateMemberRole(actor.orgId, memberId, role))
  })

export const updateMemberGroups = (actor: Actor, memberId: string, groupIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const members = yield* MemberRepository
    if ((yield* members.findUserId(actor.orgId, memberId)) === null) {
      return yield* Effect.fail(new NotFoundError({ entity: 'member', id: memberId }))
    }
    const ids = yield* requireOrgGroups(actor.orgId, groupIds)
    yield* members.replaceGroups(memberId, ids)
  })

export const removeMember = (actor: Actor, memberId: string) =>
  requireManager(actor).pipe(
    Effect.zipRight(Effect.flatMap(OrganizationAuthority, (authority) => authority.removeMember(actor.orgId, memberId))),
  )

/** Copies the invitation's group grants onto the caller's own member row. */
export const finalizeAcceptance = (userId: string, memberId: string, invitationId: string) =>
  Effect.gen(function* () {
    const members = yield* MemberRepository
    if (!(yield* members.isAcceptedBy(userId, memberId, invitationId))) {
      return yield* Effect.fail(new ForbiddenError({ reason: 'invitation-not-accepted-by-caller' }))
    }
    yield* members.grantInvitationGroups(invitationId, memberId)
  })

/**
 * The only way to accept an invitation: with the secret from the invite link.
 * Better Auth's own endpoint trusts the invitation id alone, which any member
 * can list, while password sign-ups don't prove email ownership.
 */
export const acceptInvite = (userId: string, invitationId: string, secret: string) =>
  Effect.gen(function* () {
    const members = yield* MemberRepository
    const expected = yield* members.findInvitationSecret(invitationId)
    if (!expected || !secretsMatch(expected, secret)) {
      return yield* Effect.fail(new ForbiddenError({ reason: 'invalid-invitation-link' }))
    }
    const { memberId } = yield* Effect.flatMap(OrganizationAuthority, (authority) =>
      authority.acceptInvitation(invitationId),
    )
    yield* finalizeAcceptance(userId, memberId, invitationId)
  })
