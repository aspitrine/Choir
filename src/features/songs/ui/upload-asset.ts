import { confirmUploadFn, createUploadIntentFn, deleteAssetFn } from '@/features/songs/server/assets.functions'
import { guessAssetKind } from '@/features/songs/domain/song'
import type { CreateUploadIntentInput } from '@/features/songs/domain/song'
import { computeWaveform } from '@/shared/ui/media/waveform-peaks'

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
  const kind = guessAssetKind(file.type)
  const { assetId, uploadUrl } = await createUploadIntentFn({
    data: {
      songId,
      kind,
      label,
      filename: file.name,
      contentType,
      groupIds: [...groupIds],
    },
  })
  try {
    // Drawn by the player instead of decoding the whole file on every listen.
    // Best effort: a format this browser can't decode is uploaded without one.
    const waveform = kind === 'audio' ? file.arrayBuffer().then(computeWaveform).catch(() => null) : null
    const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
    if (!res.ok) throw new Error(`Storage refused the upload (${res.status})`)
    return await confirmUploadFn({ data: { assetId, waveform: await waveform } })
  } catch (error) {
    await deleteAssetFn({ data: { assetId } }).catch(() => {})
    throw error
  }
}
