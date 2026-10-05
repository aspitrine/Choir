import { Context, Effect, Layer } from 'effect'
import { and, eq } from 'drizzle-orm'
import { auth, type Auth as BetterAuthInstance } from '../lib/auth'
import { Database } from './Database'
import { member } from '../db/schema'
import { UnauthenticatedError, ForbiddenError } from '../domain/errors'

type Session = NonNullable<Awaited<ReturnType<BetterAuthInstance['api']['getSession']>>>

export class AuthService extends Context.Tag('AuthService')<
  AuthService,
  {
    readonly getSession: (headers: Headers) => Effect.Effect<Session | null>
    readonly requireSession: (
      headers: Headers,
    ) => Effect.Effect<Session, UnauthenticatedError>
    /**
     * The session's active organization, only if the user is still a member of it.
     * Better Auth keeps `activeOrganizationId` on a removed member's other sessions,
     * so the session alone is not proof of membership.
     */
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

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const db = yield* Database

    const isMember = (orgId: string, userId: string) =>
      Effect.promise(() =>
        db
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
          .limit(1),
      ).pipe(Effect.map((rows) => rows.length > 0))

    return {
      getSession,
      requireSession,
      requireActiveOrganizationId: (headers) =>
        requireSession(headers).pipe(
          Effect.flatMap((session) => {
            const orgId = (session.session as { activeOrganizationId?: string | null })
              .activeOrganizationId
            if (!orgId) return Effect.fail(new ForbiddenError({ reason: 'no-active-organization' }))
            const userId = session.user.id
            return isMember(orgId, userId).pipe(
              Effect.flatMap((ok) =>
                ok
                  ? Effect.succeed({ orgId, userId })
                  : Effect.fail(new ForbiddenError({ reason: 'not-a-member' })),
              ),
            )
          }),
        ),
    }
  }),
)
