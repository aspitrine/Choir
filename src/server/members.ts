import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Members } from '../services/Members'
import { Access } from '../services/Access'
import { Assets } from '../services/Assets'
import { Storage } from '../services/Storage'
import { AppRuntime } from '../services/Runtime'
import { ByInvitation, ByMember, CreateInviteInput, AcceptInvitationInput, UpdateMemberGroupsInput, UpdateMemberRoleInput, decodeInput } from '../domain/inputs'
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
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        // Pending invitations carry the invite secret; member rows carry emails.
        yield* access.requireManager(orgId, userId)
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
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        // Pending invitations carry the invite secret; member rows carry emails.
        yield* access.requireManager(orgId, userId)
        return yield* members.searchInvitations(orgId, data)
      }),
    ),
  )

export const createInviteFn = createServerFn({ method: 'POST' })
  .validator(
    decodeInput(CreateInviteInput),
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
  .validator(decodeInput(ByInvitation))
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
  .validator(decodeInput(UpdateMemberRoleInput))
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
  .validator(decodeInput(UpdateMemberGroupsInput))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* members.updateMemberGroups(orgId, data.memberId, data.groupIds)
      }),
    ),
  )

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByMember))
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

// The only way to accept an invitation: Better Auth's own accept endpoint is
// disabled over HTTP (see lib/auth.ts) because it trusts the invitation id alone,
// which any member can list, and password sign-ups don't prove email ownership.
export const acceptInvitationFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(AcceptInvitationInput))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const members = yield* Members
        const session = yield* auth.requireSession(headers())
        yield* members.acceptInvite(headers(), session.user.id, data.invitationId, data.secret)
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
