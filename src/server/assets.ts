import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Assets } from '../services/Assets'
import { Access } from '../services/Access'
import { AppRuntime } from '../services/Runtime'
import { CreateUploadIntentInput } from '../domain/songs'

function headers() {
  return getRequestHeaders() as unknown as Headers
}

export const createUploadIntentFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => Schema.decodeUnknownSync(CreateUploadIntentInput)(data))
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const assets = yield* Assets
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* assets.createUploadIntent(orgId, data)
      }),
    ),
  )

export const confirmUploadFn = createServerFn({ method: 'POST' })
  .validator((data: { assetId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const assets = yield* Assets
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        return yield* assets.confirmUpload(orgId, data.assetId)
      }),
    ),
  )

export const setAssetGroupsFn = createServerFn({ method: 'POST' })
  .validator((data: { assetId: string; groupIds: Array<string> }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const assets = yield* Assets
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* assets.setGroups(orgId, data.assetId, data.groupIds)
      }),
    ),
  )

export const deleteAssetFn = createServerFn({ method: 'POST' })
  .validator((data: { assetId: string }) => data)
  .handler(({ data }) =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* AuthService
        const assets = yield* Assets
        const access = yield* Access
        const { orgId, userId } = yield* auth.requireActiveOrganizationId(headers())
        yield* access.requireManager(orgId, userId)
        yield* assets.remove(orgId, data.assetId)
      }),
    ),
  )
