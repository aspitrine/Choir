import { Effect } from 'effect'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { group } from '../db/schema'
import { NotFoundError } from '../domain/errors'

/**
 * Group ids come from the client: make sure every one belongs to the caller's
 * organization before tagging anything with it (otherwise another choir's
 * group could be attached — and its name shown on public share pages).
 * Returns the ids deduplicated, ready to insert.
 */
export const requireOrgGroups = (db: Db, orgId: string, groupIds: ReadonlyArray<string>) => {
  const unique = [...new Set(groupIds)]
  if (unique.length === 0) return Effect.succeed(unique)
  return Effect.promise(() =>
    db
      .select({ id: group.id })
      .from(group)
      .where(and(eq(group.organizationId, orgId), inArray(group.id, unique))),
  ).pipe(
    Effect.flatMap((rows) => {
      const found = new Set(rows.map((r) => r.id))
      const missing = unique.filter((id) => !found.has(id))
      return missing.length === 0
        ? Effect.succeed(unique)
        : Effect.fail(new NotFoundError({ entity: 'group', id: missing.join(',') }))
    }),
  )
}
