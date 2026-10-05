import { Context, Effect, Layer } from 'effect'
import { eq, and, ilike, count, asc } from 'drizzle-orm'
import { Database } from './Database'
import { group } from '../db/schema'
import { NotFoundError } from '../domain/errors'
import { PAGE_SIZE, containsPattern, type Page } from '../domain/pagination'

export class Groups extends Context.Tag('Groups')<
  Groups,
  {
    /** Full unpaginated list — for pickers (upload form, asset tagging dialog). */
    readonly list: (orgId: string) => Effect.Effect<Array<typeof group.$inferSelect>>
    /** Paginated + searchable — for the groups management table. */
    readonly search: (
      orgId: string,
      params: { q: string; page: number },
    ) => Effect.Effect<Page<typeof group.$inferSelect>>
    readonly create: (
      orgId: string,
      name: string,
    ) => Effect.Effect<typeof group.$inferSelect>
    readonly remove: (orgId: string, groupId: string) => Effect.Effect<void, NotFoundError>
  }
>() {}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'groupe'
  )
}

export const GroupsLive = Layer.effect(
  Groups,
  Effect.gen(function* () {
    const db = yield* Database

    return {
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

      create: (orgId, name) =>
        Effect.promise(() =>
          db
            .insert(group)
            .values({
              id: crypto.randomUUID(),
              organizationId: orgId,
              name,
              slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`,
            })
            .returning(),
        ).pipe(Effect.map(([row]) => row!)),

      remove: (orgId, groupId) =>
        Effect.promise(() =>
          db
            .select({ id: group.id })
            .from(group)
            .where(and(eq(group.id, groupId), eq(group.organizationId, orgId)))
            .limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row
              ? Effect.promise(() => db.delete(group).where(eq(group.id, groupId))).pipe(Effect.asVoid)
              : Effect.fail(new NotFoundError({ entity: 'group', id: groupId })),
          ),
        ),
    }
  }),
)
