import { createServerFn } from '@tanstack/react-start'
import { Schema } from 'effect'
import { GroupIds, Id } from '@/shared/domain/schemas'
import { decodeInput } from '@/shared/server/request'
import { withActor } from '@/app/runtime'
import { CreateUploadIntentInput } from '../domain/song'
import { confirmUpload, createUploadIntent, deleteAsset, setAssetGroups } from '../application/assets'

const ByAsset = Schema.Struct({ assetId: Id })

export const createUploadIntentFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(CreateUploadIntentInput))
  .handler(({ data }) => withActor((actor) => createUploadIntent(actor, data)))

export const confirmUploadFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByAsset))
  .handler(({ data }) => withActor((actor) => confirmUpload(actor, data.assetId)))

export const setAssetGroupsFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(Schema.Struct({ assetId: Id, groupIds: GroupIds })))
  .handler(({ data }) => withActor((actor) => setAssetGroups(actor, data.assetId, data.groupIds)))

export const deleteAssetFn = createServerFn({ method: 'POST' })
  .validator(decodeInput(ByAsset))
  .handler(({ data }) => withActor((actor) => deleteAsset(actor, data.assetId)))
