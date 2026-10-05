import { Effect, Layer } from 'effect'
import { ValidationError } from '@/shared/domain/errors'
import { requestHeaders } from '@/shared/server/request'
import { auth } from '@/features/auth/infrastructure/better-auth'
import { OrganizationAuthority } from '../application/ports'

// Better Auth acts as the signed-in user of the current request (its cookies).
const call = <A>(run: (headers: Headers) => Promise<A>, fallback: string) =>
  Effect.tryPromise({
    try: () => run(requestHeaders()),
    catch: (cause) => new ValidationError({ message: (cause as Error)?.message || fallback }),
  })

/** Adapter: OrganizationAuthority backed by Better Auth's organization plugin. */
export const BetterAuthOrganizationAuthority = Layer.succeed(OrganizationAuthority, {
  createInvitation: ({ orgId, email, role, firstName, lastName }) =>
    call(
      (headers) =>
        auth.api.createInvitation({
          headers,
          body: {
            email,
            role,
            organizationId: orgId,
            firstName: firstName ?? undefined,
            lastName: lastName ?? undefined,
          },
        }),
      'Invitation impossible',
    ).pipe(Effect.map((created) => ({ id: created.id }))),

  acceptInvitation: (invitationId) =>
    call((headers) => auth.api.acceptInvitation({ headers, body: { invitationId } }), "Impossible d'accepter l'invitation").pipe(
      Effect.flatMap((accepted) =>
        accepted?.member
          ? Effect.succeed({ memberId: accepted.member.id })
          : Effect.fail(new ValidationError({ message: "Impossible d'accepter l'invitation" })),
      ),
    ),

  cancelInvitation: (invitationId) =>
    call((headers) => auth.api.cancelInvitation({ headers, body: { invitationId } }), 'Révocation impossible').pipe(
      Effect.asVoid,
    ),

  updateMemberRole: (orgId, memberId, role) =>
    call(
      (headers) => auth.api.updateMemberRole({ headers, body: { organizationId: orgId, memberId, role } }),
      'Modification impossible',
    ).pipe(Effect.asVoid),

  removeMember: (orgId, memberId) =>
    call(
      (headers) => auth.api.removeMember({ headers, body: { organizationId: orgId, memberIdOrEmail: memberId } }),
      'Suppression impossible',
    ).pipe(Effect.asVoid),

  deleteOrganization: (orgId) =>
    call((headers) => auth.api.deleteOrganization({ headers, body: { organizationId: orgId } }), 'Suppression impossible').pipe(
      Effect.asVoid,
    ),
})
