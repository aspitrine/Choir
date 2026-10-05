import { Context, Effect, Layer } from 'effect'
import { eq, and, or, ilike, count, inArray } from 'drizzle-orm'
import { Database } from './Database'
import { member, user, invitation, invitationGroup, memberGroup, group } from '../db/schema'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { auth } from '../lib/auth'
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors'
import { PAGE_SIZE, type Page } from '../domain/pagination'
import { requireOrgGroups } from './orgGroups'

export type InviteRole = 'admin' | 'member'

type MemberRow = {
  member: typeof member.$inferSelect
  user: { id: string; name: string; email: string }
  groups: Array<typeof group.$inferSelect>
}

type InvitationRow = { invitation: typeof invitation.$inferSelect; groups: Array<typeof group.$inferSelect> }

export class Members extends Context.Tag('Members')<
  Members,
  {
    readonly search: (orgId: string, params: { q: string; page: number }) => Effect.Effect<Page<MemberRow>>
    readonly searchInvitations: (
      orgId: string,
      params: { q: string; page: number },
    ) => Effect.Effect<Page<InvitationRow>>
    readonly createInvite: (
      headers: Headers,
      orgId: string,
      input: {
        email: string
        firstName: string | null
        lastName: string | null
        role: InviteRole
        groupIds: ReadonlyArray<string>
      },
    ) => Effect.Effect<{ id: string; secret: string }, ValidationError | NotFoundError>
    /**
     * Accepts an invitation for the signed-in user, only with the secret from the
     * invite link, then copies its group grants onto the new member.
     */
    readonly acceptInvite: (
      headers: Headers,
      userId: string,
      invitationId: string,
      secret: string,
    ) => Effect.Effect<void, ForbiddenError | ValidationError>
    readonly revokeInvite: (headers: Headers, invitationId: string) => Effect.Effect<void, ValidationError>
    readonly updateMemberRole: (
      headers: Headers,
      orgId: string,
      callerUserId: string,
      memberId: string,
      role: InviteRole,
    ) => Effect.Effect<void, ValidationError>
    readonly updateMemberGroups: (
      orgId: string,
      memberId: string,
      groupIds: ReadonlyArray<string>,
    ) => Effect.Effect<void, NotFoundError>
    readonly removeMember: (
      headers: Headers,
      orgId: string,
      memberId: string,
    ) => Effect.Effect<void, ValidationError>
    /**
     * Copies group grants from an accepted invitation onto the resulting member row.
     * The member must be the caller's own, in the invitation's organization.
     */
    readonly finalizeAcceptance: (
      userId: string,
      memberId: string,
      invitationId: string,
    ) => Effect.Effect<void, ForbiddenError>
    /**
     * Deletes the organization row. Every domain table (song, playlist, group, asset, …)
     * references organization.id with ON DELETE CASCADE, so this wipes all choir data —
     * only the S3 objects survive and must be cleaned up separately beforehand.
     */
    readonly deleteOrganization: (headers: Headers, orgId: string) => Effect.Effect<void, ValidationError>
  }
>() {}

function secretsMatch(expected: string, given: string) {
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const MembersLive = Layer.effect(
  Members,
  Effect.gen(function* () {
    const db = yield* Database

  const finalizeAcceptance = (userId: string, memberId: string, invitationId: string) =>
      Effect.promise(() =>
        db
          .select({ id: member.id })
          .from(member)
          .innerJoin(invitation, eq(invitation.organizationId, member.organizationId))
          .where(
            and(
              eq(member.id, memberId),
              eq(member.userId, userId),
              eq(invitation.id, invitationId),
              eq(invitation.status, 'accepted'),
            ),
          )
          .limit(1),
      ).pipe(
        Effect.flatMap(([row]) =>
          row ? Effect.void : Effect.fail(new ForbiddenError({ reason: 'invitation-not-accepted-by-caller' })),
        ),
        Effect.flatMap(() =>
          Effect.promise(async () => {
            const groupIds = (
              await db
                .select({ groupId: invitationGroup.groupId })
                .from(invitationGroup)
                .where(eq(invitationGroup.invitationId, invitationId))
            ).map((r) => r.groupId)
            if (groupIds.length > 0) {
              await db
                .insert(memberGroup)
                .values(groupIds.map((groupId) => ({ memberId, groupId })))
                .onConflictDoNothing()
            }
          }),
        ),
        Effect.asVoid,
      )

    return {
      search: (orgId, { q, page }) => {
        const where = and(
          eq(member.organizationId, orgId),
          q.trim() ? or(ilike(user.name, `%${q.trim()}%`), ilike(user.email, `%${q.trim()}%`)) : undefined,
        )
        return Effect.promise(async () => {
          const [rows, [{ total }]] = await Promise.all([
            db
              .select({ member, user: { id: user.id, name: user.name, email: user.email } })
              .from(member)
              .innerJoin(user, eq(user.id, member.userId))
              .where(where)
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE),
            db
              .select({ total: count() })
              .from(member)
              .innerJoin(user, eq(user.id, member.userId))
              .where(where),
          ])
          const memberIds = rows.map((r) => r.member.id)
          const groupRows =
            memberIds.length > 0
              ? await db
                  .select({ memberId: memberGroup.memberId, group })
                  .from(memberGroup)
                  .innerJoin(group, eq(group.id, memberGroup.groupId))
                  .where(inArray(memberGroup.memberId, memberIds))
              : []
          return {
            rows: rows.map((r) => ({
              ...r,
              groups: groupRows.filter((g) => g.memberId === r.member.id).map((g) => g.group),
            })),
            total,
            page,
            pageSize: PAGE_SIZE,
          }
        })
      },

      searchInvitations: (orgId, { q, page }) => {
        const where = and(
          eq(invitation.organizationId, orgId),
          eq(invitation.status, 'pending'),
          q.trim()
            ? or(
                ilike(invitation.email, `%${q.trim()}%`),
                ilike(invitation.firstName, `%${q.trim()}%`),
                ilike(invitation.lastName, `%${q.trim()}%`),
              )
            : undefined,
        )
        return Effect.promise(async () => {
          const [rows, [{ total }]] = await Promise.all([
            db
              .select()
              .from(invitation)
              .where(where)
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE),
            db.select({ total: count() }).from(invitation).where(where),
          ])
          const invitationIds = rows.map((r) => r.id)
          const groupRows =
            invitationIds.length > 0
              ? await db
                  .select({ invitationId: invitationGroup.invitationId, group })
                  .from(invitationGroup)
                  .innerJoin(group, eq(group.id, invitationGroup.groupId))
                  .where(inArray(invitationGroup.invitationId, invitationIds))
              : []
          return {
            rows: rows.map((row) => ({
              invitation: row,
              groups: groupRows.filter((g) => g.invitationId === row.id).map((g) => g.group),
            })),
            total,
            page,
            pageSize: PAGE_SIZE,
          }
        })
      },

      createInvite: (headers, orgId, input) =>
        requireOrgGroups(db, orgId, input.groupIds).pipe(
          Effect.flatMap((groupIds) =>
            Effect.tryPromise({
          try: async () =>
            ({
              ...(await
            auth.api.createInvitation({
              headers,
              body: {
                email: input.email,
                role: input.role,
                organizationId: orgId,
                firstName: input.firstName ?? undefined,
                lastName: input.lastName ?? undefined,
              },
            })),
              secret: randomBytes(32).toString('base64url'),
            }),
          catch: (cause) => new ValidationError({ message: (cause as Error).message ?? 'Invitation impossible' }),
            }).pipe(
              Effect.tap((created) =>
                Effect.promise(() =>
                  db.update(invitation).set({ secret: created.secret }).where(eq(invitation.id, created.id)),
                ),
              ),
              Effect.tap((created) =>
                groupIds.length > 0
                  ? Effect.promise(() =>
                      db
                        .insert(invitationGroup)
                        .values(groupIds.map((groupId) => ({ invitationId: created.id, groupId }))),
                    )
                  : Effect.void,
              ),
            ),
          ),
          Effect.map((created) => ({ id: created.id, secret: created.secret })),
        ),

      acceptInvite: (headers, userId, invitationId, secret) =>
        Effect.promise(() =>
          db.select({ secret: invitation.secret }).from(invitation).where(eq(invitation.id, invitationId)).limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row?.secret && secretsMatch(row.secret, secret)
              ? Effect.void
              : Effect.fail(new ForbiddenError({ reason: 'invalid-invitation-link' })),
          ),
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => auth.api.acceptInvitation({ headers, body: { invitationId } }),
              catch: (cause) =>
                new ValidationError({ message: (cause as Error).message ?? "Impossible d'accepter l'invitation" }),
            }),
          ),
          Effect.flatMap(
            (accepted): Effect.Effect<void, ForbiddenError | ValidationError> =>
              accepted?.member
                ? finalizeAcceptance(userId, accepted.member.id, invitationId)
                : Effect.fail(new ValidationError({ message: "Impossible d'accepter l'invitation" })),
          ),
        ),

      revokeInvite: (headers, invitationId) =>
        Effect.tryPromise({
          try: () => auth.api.cancelInvitation({ headers, body: { invitationId } }),
          catch: (cause) => new ValidationError({ message: (cause as Error).message ?? 'Révocation impossible' }),
        }).pipe(Effect.asVoid),

      updateMemberRole: (headers, orgId, callerUserId, memberId, role) =>
        Effect.promise(() =>
          db.select({ userId: member.userId }).from(member).where(eq(member.id, memberId)).limit(1),
        ).pipe(
          Effect.flatMap(([target]) =>
            target?.userId === callerUserId
              ? Effect.fail(new ValidationError({ message: 'Vous ne pouvez pas modifier votre propre rôle' }))
              : Effect.void,
          ),
          Effect.flatMap(() =>
            Effect.tryPromise({
              try: () => auth.api.updateMemberRole({ headers, body: { organizationId: orgId, memberId, role } }),
              catch: (cause) =>
                new ValidationError({ message: (cause as Error).message ?? 'Modification impossible' }),
            }),
          ),
          Effect.asVoid,
        ),

      updateMemberGroups: (orgId, memberId, groupIds) =>
        Effect.promise(() =>
          db
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
            .limit(1),
        ).pipe(
          Effect.flatMap(([row]) =>
            row ? Effect.void : Effect.fail(new NotFoundError({ entity: 'member', id: memberId })),
          ),
          Effect.flatMap(() => requireOrgGroups(db, orgId, groupIds)),
          Effect.flatMap((ids) =>
            Effect.promise(async () => {
              await db.delete(memberGroup).where(eq(memberGroup.memberId, memberId))
              if (ids.length > 0) {
                await db.insert(memberGroup).values(ids.map((groupId) => ({ memberId, groupId })))
              }
            }),
          ),
          Effect.asVoid,
        ),

      removeMember: (headers, orgId, memberId) =>
        Effect.tryPromise({
          try: () =>
            auth.api.removeMember({ headers, body: { organizationId: orgId, memberIdOrEmail: memberId } }),
          catch: (cause) => new ValidationError({ message: (cause as Error).message ?? 'Suppression impossible' }),
        }).pipe(Effect.asVoid),

      finalizeAcceptance,

      deleteOrganization: (headers, orgId) =>
        Effect.tryPromise({
          try: () => auth.api.deleteOrganization({ headers, body: { organizationId: orgId } }),
          catch: (cause) => new ValidationError({ message: (cause as Error).message ?? 'Suppression impossible' }),
        }).pipe(Effect.asVoid),
    }
  }),
)
