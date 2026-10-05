import { Effect, Layer } from 'effect'
import { SessionReader } from '../application/ports'
import { auth } from './better-auth'

/** Adapter: sessions managed by Better Auth (cookies). */
export const BetterAuthSessionReader = Layer.succeed(SessionReader, {
  getSession: (headers) =>
    Effect.promise(() => auth.api.getSession({ headers })).pipe(
      Effect.map((session) =>
        session
          ? {
              userId: session.user.id,
              email: session.user.email,
              activeOrganizationId:
                (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
            }
          : null,
      ),
    ),
})
