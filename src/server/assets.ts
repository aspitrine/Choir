import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { AuthService } from '../services/Auth'
import { Assets } from '../services/Assets'
import { Access } from '../services/Access'
import { AppRuntime } from '../services/Runtime'
import { ByAsset, SetAssetGroupsInput, decodeInput } from '../domain/inputs'
import { CreateUploadIntentInput } from '../domain/songs'

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000

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
        // Opportunistic cleanup of transfers abandoned more than a day ago.
        yield* assets.purgeStaleUploads(orgId, new Date(Date.now() - STALE_UPLOAD_MS))
        return yield* assets.createUploadIntent(orgId, data)
      }),
    ),
  )

export const confirmUploadFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByAsset))
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
  .validator(decodeInput(SetAssetGroupsInput))
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
  .validator(decodeInput(ByAsset))
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
