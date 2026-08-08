import { Context, Effect, Layer } from 'effect'
import { eq, and } from 'drizzle-orm'
import { Database } from './Database'
import { member } from '../db/schema'
import { ForbiddenError } from '../domain/errors'

export type OrgRole = 'owner' | 'admin' | 'member'

// Choir singers are never registered users — the only people who authenticate
// are directors managing content. This service just gates writes to
// owner/admin org members (in case a choir has co-directors).
export class Access extends Context.Tag('Access')<
  Access,
  {
    readonly getRole: (orgId: string, userId: string) => Effect.Effect<OrgRole>
    readonly isManager: (orgId: string, userId: string) => Effect.Effect<boolean>
    readonly requireManager: (
      orgId: string,
      userId: string,
    ) => Effect.Effect<void, ForbiddenError>
  }
>() {}

export const AccessLive = Layer.effect(
  Access,
  Effect.gen(function* () {
    const db = yield* Database

    const getRole: (orgId: string, userId: string) => Effect.Effect<OrgRole> = (orgId, userId) =>
      Effect.promise(() =>
        db
          .select({ role: member.role })
          .from(member)
          .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
          .limit(1),
      ).pipe(Effect.map(([row]) => (row?.role as OrgRole) ?? 'member'))

    const isManager = (orgId: string, userId: string) =>
      getRole(orgId, userId).pipe(Effect.map((role) => role === 'owner' || role === 'admin'))

    const requireManager = (orgId: string, userId: string) =>
      isManager(orgId, userId).pipe(
        Effect.flatMap((managing) =>
          managing
            ? Effect.void
            : Effect.fail(new ForbiddenError({ reason: 'manager-role-required' })),
        ),
      )

    return { getRole, isManager, requireManager }
  }),
)
