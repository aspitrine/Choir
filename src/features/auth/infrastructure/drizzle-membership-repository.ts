import { Effect, Layer } from 'effect'
import { and, eq } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { MembershipRepository } from '../application/ports'
import type { OrgRole } from '../domain/roles'
import { member } from './schema'

export const DrizzleMembershipRepository = Layer.effect(
  MembershipRepository,
  Effect.map(Database, (db) => ({
    findRole: (orgId: string, userId: string) =>
      Effect.promise(() =>
        db
          .select({ role: member.role })
          .from(member)
          .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
          .limit(1),
      ).pipe(Effect.map(([row]) => (row?.role as OrgRole | undefined) ?? null)),
  })),
)
