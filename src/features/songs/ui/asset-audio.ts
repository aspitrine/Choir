import { saveWaveformFn } from '@/features/songs/server/assets.functions'
import type { Waveform } from '@/shared/ui/media/waveform-peaks'

/** Stable address of a choir's file: the server redirects to a fresh presigned URL. */
export function assetFileUrl(assetId: string) {
  return `/api/files/${encodeURIComponent(assetId)}`
}

/** Stores the waveform a member's browser computed for an older audio file. */
export const saveAssetWaveform = (assetId: string) => (waveform: Waveform) =>
  saveWaveformFn({ data: { assetId, waveform } })
