import { Context, Effect, Layer } from 'effect'
import { auth, type Auth as BetterAuthInstance } from '../lib/auth'
import { UnauthenticatedError, ForbiddenError } from '../domain/errors'

type Session = NonNullable<Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>>

export class AuthService extends Context.Tag('AuthService')<
  AuthService,
  {
    readonly getSession: (headers: Headers) => Effect.Effect<Session | null>
    readonly requireSession: (
      headers: Headers,
    ) => Effect.Effect<Session, UnauthenticatedError>
    readonly requireActiveOrganizationId: (
      headers: Headers,
    ) => Effect.Effect<
      { orgId: string; userId: string },
      UnauthenticatedError | ForbiddenError
    >
  }
>() {}

const getSession = (headers: Headers) =>
  Effect.promise(() => auth.api.getSession({ headers }))

const requireSession = (headers: Headers) =>
  getSession(headers).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : Effect.fail(new UnauthenticatedError()),
    ),
  )

export const AuthServiceLive = Layer.succeed(AuthService, {
  getSession,
  requireSession,
  requireActiveOrganizationId: (headers) =>
    requireSession(headers).pipe(
      Effect.flatMap((session) => {
        const orgId = (session.session as { activeOrganizationId?: string | null })
          .activeOrganizationId
        return orgId
          ? Effect.succeed({ orgId, userId: session.user.id })
          : Effect.fail(new ForbiddenError({ reason: 'no-active-organization' }))
      }),
    ),
})
