import { Effect } from 'effect'
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/domain/errors'
import type { PageParams } from '@/shared/domain/pagination'
import { requireManager } from '@/features/auth/application/access'
import type { Actor, AssignableRole } from '@/features/auth/domain/roles'
import { requireOrgGroups } from '@/features/groups/application/groups'
import { OrganizationAuthority } from '@/features/organizations/application/ports'
import {
  generateInvitationSecret,
  secretsMatch,
  type CreateInviteInput,
  type UpdateInviteInput,
  type UpdateMemberProfileInput,
} from '../domain/invitation'
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

/**
 * Only while pending: once accepted, the member's own role and groups are
 * edited instead. A new email gets a new link: the one sent to the previous
 * address stops working (its holder isn't the invitee anymore).
 */
export const updateInvite = (actor: Actor, { invitationId, groupIds, email, ...details }: UpdateInviteInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const ids = yield* requireOrgGroups(actor.orgId, groupIds)
    const members = yield* MemberRepository
    const current = yield* members.findPendingInvitation(actor.orgId, invitationId)
    if (!current) return yield* Effect.fail(new NotFoundError({ entity: 'invitation', id: invitationId }))
    const newEmail = email.toLowerCase()
    const emailChanged = newEmail !== current.email.toLowerCase()
    if (emailChanged && (yield* members.isEmailInOrg(actor.orgId, newEmail, invitationId))) {
      return yield* Effect.fail(
        new ValidationError({ message: 'Cet email est déjà celui d\'un membre ou d\'une autre invitation' }),
      )
    }
    const secret = emailChanged ? generateInvitationSecret() : undefined
    const saved = yield* members.updatePendingInvitation(actor.orgId, invitationId, {
      ...details,
      email: emailChanged ? newEmail : current.email,
      secret,
      groupIds: ids,
    })
    if (!saved) return yield* Effect.fail(new NotFoundError({ entity: 'invitation', id: invitationId }))
    return { linkChanged: emailChanged }
  })

/**
 * Renames a member's account, and changes its email only where that can't hand
 * someone else's access over: the account belongs to this choir alone (a
 * manager here has no say over the member's other choirs), and the owner's
 * email is the owner's own business. The account email is the sign-in
 * identifier: it must stay unique.
 */
export const updateMemberProfile = (actor: Actor, { memberId, name, email }: UpdateMemberProfileInput) =>
  Effect.gen(function* () {
    yield* requireManager(actor)
    const members = yield* MemberRepository
    const account = yield* members.findMemberAccount(actor.orgId, memberId)
    if (!account) return yield* Effect.fail(new NotFoundError({ entity: 'member', id: memberId }))
    const newEmail = email.toLowerCase()
    const emailChanged = newEmail !== account.email.toLowerCase()
    if (emailChanged) {
      const isSelf = account.userId === actor.userId
      if (!isSelf && account.orgCount > 1) {
        return yield* Effect.fail(
          new ValidationError({
            message: 'Ce membre fait aussi partie d\'autres chorales : seul lui peut changer son email',
          }),
        )
      }
      if (!isSelf && account.role === 'owner') {
        return yield* Effect.fail(new ValidationError({ message: 'Seul le propriétaire peut changer son email' }))
      }
      if (yield* members.isEmailTaken(newEmail, account.userId)) {
        return yield* Effect.fail(new ValidationError({ message: 'Cet email est déjà utilisé par un autre compte' }))
      }
    }
    yield* members.updateAccount(account.userId, { name, ...(emailChanged ? { email: newEmail } : {}) })
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
 * What the invite link page needs before signing in: whether the link was
 * already used (a second visit goes straight to the app) and the name the
 * inviter entered, to prefill the sign-up form. Public (no session yet):
 * requires the link's secret, so the invitation id alone reveals nothing.
 */
export const readInviteLink = (invitationId: string, secret: string) =>
  Effect.gen(function* () {
    const link = yield* Effect.flatMap(MemberRepository, (members) => members.findInvitationLink(invitationId))
    if (!link?.secret || !secretsMatch(link.secret, secret)) return null
    return {
      used: link.status === 'accepted',
      inviteeName: [link.firstName, link.lastName].filter(Boolean).join(' '),
    }
  })

/**
 * The only way to accept an invitation: with the secret from the invite link.
 * Better Auth's own endpoint trusts the invitation id alone, which any member
 * can list, while password sign-ups don't prove email ownership.
 */
export const acceptInvite = (userId: string, invitationId: string, secret: string) =>
  Effect.gen(function* () {
    const members = yield* MemberRepository
    const expected = (yield* members.findInvitationLink(invitationId))?.secret
    if (!expected || !secretsMatch(expected, secret)) {
      return yield* Effect.fail(new ForbiddenError({ reason: 'invalid-invitation-link' }))
    }
    const { memberId } = yield* Effect.flatMap(OrganizationAuthority, (authority) =>
      authority.acceptInvitation(invitationId),
    )
    yield* finalizeAcceptance(userId, memberId, invitationId)
  })
