import { confirmUploadFn, createUploadIntentFn, deleteAssetFn } from '@/features/songs/server/assets.functions'
import { guessAssetKind } from '@/features/songs/domain/song'
import type { CreateUploadIntentInput } from '@/features/songs/domain/song'

export type UploadAssetInput = {
  songId: string
  file: File
  label: string | null
  groupIds: ReadonlyArray<string>
}

/**
 * Whole upload as one unit of work (used as a mutation function): reserve the
 * asset, send the bytes straight to storage, then confirm. If any step fails
 * after the reservation, the pending asset is deleted so no row stays stuck in
 * "uploading".
 */
export async function uploadAsset({ songId, file, label, groupIds }: UploadAssetInput) {
  const contentType = file.type as CreateUploadIntentInput['contentType']
  const { assetId, uploadUrl } = await createUploadIntentFn({
    data: {
      songId,
      kind: guessAssetKind(file.type),
      label,
      filename: file.name,
      contentType,
      groupIds: [...groupIds],
    },
  })
  try {
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
    if (!res.ok) throw new Error(`Storage refused the upload (${res.status})`)
    return await confirmUploadFn({ data: { assetId } })
  } catch (error) {
    await deleteAssetFn({ data: { assetId } }).catch(() => {})
    throw error
  }
}
