import { Effect, Layer } from 'effect'
import { and, asc, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { Database } from '@/shared/infrastructure/db/database'
import { PAGE_SIZE, containsPattern } from '@/shared/domain/pagination'
import { invitation, member, user } from '@/features/auth/infrastructure/schema'
import { group } from '@/features/groups/infrastructure/schema'
import { MemberRepository } from '../application/ports'
import { invitationGroup, memberGroup } from './schema'

export const DrizzleMemberRepository = Layer.effect(
  MemberRepository,
  Effect.map(Database, (db) => ({
    search: (orgId, { q, page }) => {
      const pattern = containsPattern(q)
      const where = and(
        eq(member.organizationId, orgId),
        pattern ? or(ilike(user.name, pattern), ilike(user.email, pattern)) : undefined,
      )
      return Effect.promise(async () => {
        const [rows, [{ total }]] = await Promise.all([
          db
            .select({ member, user: { id: user.id, name: user.name, email: user.email } })
            .from(member)
            .innerJoin(user, eq(user.id, member.userId))
            .where(where)
            .orderBy(asc(user.name), asc(member.id))
            .limit(PAGE_SIZE)
            .offset((page - 1) * PAGE_SIZE),
          db.select({ total: count() }).from(member).innerJoin(user, eq(user.id, member.userId)).where(where),
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

    searchPendingInvitations: (orgId, { q, page }) => {
      const pattern = containsPattern(q)
      const where = and(
        eq(invitation.organizationId, orgId),
        eq(invitation.status, 'pending'),
        pattern
          ? or(ilike(invitation.email, pattern), ilike(invitation.firstName, pattern), ilike(invitation.lastName, pattern))
          : undefined,
      )
      return Effect.promise(async () => {
        const [rows, [{ total }]] = await Promise.all([
          db
            .select()
            .from(invitation)
            .where(where)
            .orderBy(desc(invitation.createdAt), asc(invitation.id))
            .limit(PAGE_SIZE)
            .offset((page - 1) * PAGE_SIZE),
          db.select({ total: count() }).from(invitation).where(where),
        ])
        const ids = rows.map((r) => r.id)
        const groupRows =
          ids.length > 0
            ? await db
                .select({ invitationId: invitationGroup.invitationId, group })
                .from(invitationGroup)
                .innerJoin(group, eq(group.id, invitationGroup.groupId))
                .where(inArray(invitationGroup.invitationId, ids))
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

    findUserId: (orgId, memberId) =>
      Effect.promise(() =>
        db
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
          .limit(1),
      ).pipe(Effect.map(([row]) => row?.userId ?? null)),

    replaceGroups: (memberId, groupIds) =>
      Effect.promise(async () => {
        await db.delete(memberGroup).where(eq(memberGroup.memberId, memberId))
        if (groupIds.length > 0) {
          await db.insert(memberGroup).values(groupIds.map((groupId) => ({ memberId, groupId })))
        }
      }),

    saveInvitation: (invitationId, { secret, groupIds }) =>
      Effect.promise(async () => {
        await db.update(invitation).set({ secret }).where(eq(invitation.id, invitationId))
        if (groupIds.length > 0) {
          await db.insert(invitationGroup).values(groupIds.map((groupId) => ({ invitationId, groupId })))
        }
      }),

    findInvitationSecret: (invitationId) =>
      Effect.promise(() =>
        db.select({ secret: invitation.secret }).from(invitation).where(eq(invitation.id, invitationId)).limit(1),
      ).pipe(Effect.map(([row]) => row?.secret ?? null)),

    isAcceptedBy: (userId, memberId, invitationId) =>
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
      ).pipe(Effect.map((rows) => rows.length > 0)),

    grantInvitationGroups: (invitationId, memberId) =>
      Effect.promise(async () => {
        const rows = await db
          .select({ groupId: invitationGroup.groupId })
          .from(invitationGroup)
          .where(eq(invitationGroup.invitationId, invitationId))
        if (rows.length > 0) {
          await db
            .insert(memberGroup)
            .values(rows.map((r) => ({ memberId, groupId: r.groupId })))
            .onConflictDoNothing()
        }
      }),
  })),
)
