import { Effect, Layer } from 'effect'
import { and, asc, count, eq, ilike, inArray } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { NotFoundError } from '@/shared/domain/errors'
import { PAGE_SIZE, containsPattern } from '@/shared/domain/pagination'
import { GroupRepository } from '../application/ports'
import { group } from './schema'

export const DrizzleGroupRepository = Layer.effect(
  GroupRepository,
  Effect.map(Database, (db) => ({
    list: (orgId) =>
      Effect.promise(() =>
        db.select().from(group).where(eq(group.organizationId, orgId)).orderBy(asc(group.name), asc(group.id)),
      ),

    search: (orgId, { q, page }) => {
      const pattern = containsPattern(q)
      const where = and(eq(group.organizationId, orgId), pattern ? ilike(group.name, pattern) : undefined)
      return Effect.promise(async () => {
        const [rows, [{ total }]] = await Promise.all([
          db
            .select()
            .from(group)
            .where(where)
            // Deterministic order, otherwise pages can repeat or skip rows.
            .orderBy(asc(group.name), asc(group.id))
            .limit(PAGE_SIZE)
            .offset((page - 1) * PAGE_SIZE),
          db.select({ total: count() }).from(group).where(where),
        ])
        return { rows, total, page, pageSize: PAGE_SIZE }
      })
    },

    create: (orgId, { name, slug }) =>
      Effect.promise(() =>
        db.insert(group).values({ id: crypto.randomUUID(), organizationId: orgId, name, slug }).returning(),
      ).pipe(Effect.map(([row]) => row!)),

    remove: (orgId, groupId) =>
      Effect.promise(() =>
        db
          .delete(group)
          .where(and(eq(group.id, groupId), eq(group.organizationId, orgId)))
          .returning({ id: group.id }),
      ).pipe(
        Effect.flatMap((rows) =>
          rows.length > 0 ? Effect.void : Effect.fail(new NotFoundError({ entity: 'group', id: groupId })),
        ),
      ),

    existingIds: (orgId, groupIds) =>
      Effect.promise(() =>
        db
          .select({ id: group.id })
          .from(group)
          .where(and(eq(group.organizationId, orgId), inArray(group.id, [...groupIds]))),
      ).pipe(Effect.map((rows) => rows.map((r) => r.id))),
  })),
)
