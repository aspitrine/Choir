import { Effect } from 'effect'
import { ForbiddenError, UnauthenticatedError } from '@/shared/domain/errors'
import { isManagerRole, type Actor } from '../domain/roles'
import { MembershipRepository, SessionReader } from './ports'

export const requireSession = (headers: Headers) =>
  Effect.flatMap(SessionReader, (sessions) => sessions.getSession(headers)).pipe(
    Effect.flatMap((session) => (session ? Effect.succeed(session) : Effect.fail(new UnauthenticatedError()))),
  )

/**
 * The caller in their active choir. Membership is checked on every call: Better
 * Auth keeps `activeOrganizationId` on a removed member's other sessions, so the
 * session alone is not proof of membership.
 */
export const currentActor = (headers: Headers) =>
  Effect.gen(function* () {
    const session = yield* requireSession(headers)
    if (!session.activeOrganizationId) {
      return yield* Effect.fail(new ForbiddenError({ reason: 'no-active-organization' }))
    }
    const memberships = yield* MembershipRepository
    const role = yield* memberships.findRole(session.activeOrganizationId, session.userId)
    if (!role) return yield* Effect.fail(new ForbiddenError({ reason: 'not-a-member' }))
    return { orgId: session.activeOrganizationId, userId: session.userId, role } satisfies Actor
  })

export const requireManager = (actor: Actor) =>
  isManagerRole(actor.role) ? Effect.void : Effect.fail(new ForbiddenError({ reason: 'manager-role-required' }))

export const requireOwner = (actor: Actor) =>
  actor.role === 'owner' ? Effect.void : Effect.fail(new ForbiddenError({ reason: 'owner-role-required' }))
