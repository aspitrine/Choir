import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Members, type InviteRole } from '../services/Members'
import { Access } from '../services/Access'
import { Assets } from '../services/Assets'
import { Storage } from '../services/Storage'
import { AppRuntime } from '../services/Runtime'
import { PageParams } from '../domain/pagination'
import { ForbiddenError } from '../domain/errors'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const searchMembersFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Schema.decodeUnknownSync(PageParams)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        return yield* members.search(orgId, data)
      }),
    ),
  )

export const searchInvitationsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Schema.decodeUnknownSync(PageParams)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        return yield* members.searchInvitations(orgId, data)
      }),
    ),
  )

export const createInviteFn = createServerFn({ method: 'POST' })
  .validator(
    (data: {
      email: string
      firstName: string | null
      lastName: string | null
      role: InviteRole
      groupIds: Array<string>
    }) => data,
  )
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* members.createInvite(headers(), orgId, data)
      }),
    ),
  )

export const revokeInviteFn = createServerFn({ method: 'POST' })
  .validator((data: { invitationId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* members.revokeInvite(headers(), data.invitationId)
      }),
    ),
  )

export const updateMemberRoleFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; role: InviteRole }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* members.updateMemberRole(headers(), orgId, userId, data.memberId, data.role)
      }),
    ),
  )

export const updateMemberGroupsFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; groupIds: Array<string> }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* members.updateMemberGroups(data.memberId, data.groupIds)
      }),
    ),
  )

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* members.removeMember(headers(), orgId, data.memberId)
      }),
    ),
  )

// Called by the invitee right after authClient.organization.acceptInvitation() succeeds
// client-side. Only needs a valid session — the invitation/member link was already
// validated by Better Auth's own accept flow.
export const finalizeInviteAcceptanceFn = createServerFn({ method: 'POST' })
  .validator((data: { memberId: string; invitationId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        yield* auth.requireSession(headers())
        yield* members.finalizeAcceptance(data.memberId, data.invitationId)
      }),
    ),
  )

// Used by the (not-yet-authed) accept-invite page's "My role for this org" check to
// gate the sidebar nav after acceptance. Also used by the members page itself.
export const getMyRoleFn = createServerFn({ method: 'GET' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const access = yield* Access
      const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
      return yield* access.getRole(orgId, userId)
    }),
  ),
)

// Wipes the whole choir: every domain table cascades from organization.id at the DB
// level, so this only needs to (1) clear the S3 objects first, since those don't cascade,
// then (2) delete the organization row. Owner-only — more destructive than regular admin actions.
export const deleteOrganizationFn = createServerFn({ method: 'POST' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const members = yield* Members
      const access = yield* Access
      const assets = yield* Assets
      const storage = yield* Storage
      const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
      const role = yield* access.getRole(orgId, userId)
      if (role !== 'owner') {
        yield* Effect.fail(new ForbiddenError({ reason: 'owner-role-required' }))
      }
      const storageKeys = yield* assets.listStorageKeysForOrg(orgId)
      yield* Effect.all(
        storageKeys.map((key) => storage.remove(key).pipe(Effect.catchAll(() => Effect.void))),
        { concurrency: 5 },
      )
      yield* members.deleteOrganization(headers(), orgId)
    }),
  ),
)
