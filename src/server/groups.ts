import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Groups } from '../services/Groups'
import { Access } from '../services/Access'
import { AppRuntime } from '../services/Runtime'
import { PageParams } from '../domain/pagination'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const listGroupsFn = createServerFn({ method: 'GET' }).handler(() =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthService
      const groups = yield* Groups
      const { orgId } = yield* auth.requireActiveOrganizationId(headers())
      return yield* groups.list(orgId)
    }),
  ),
)

export const searchGroupsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Schema.decodeUnknownSync(PageParams)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const groups = yield* Groups
        const { orgId } = yield* auth.requireActiveOrganizationId(headers())
        return yield* groups.search(orgId, data)
      }),
    ),
  )

export const createGroupFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const groups = yield* Groups
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* groups.create(orgId, data.name)
      }),
    ),
  )

export const deleteGroupFn = createServerFn({ method: 'POST' })
  .validator((data: { groupId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const groups = yield* Groups
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* groups.remove(orgId, data.groupId)
      }),
    ),
  )
