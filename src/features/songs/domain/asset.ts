import { Schema } from 'effect'

// Uploads abandoned for longer than this (tab closed mid-transfer…) are purged.
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000

// Keeps object keys predictable: no path segments, control or exotic characters.
export function safeFilename(filename: string) {
  const cleaned = filename
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned || 'file'
}

/** Object key of an asset: namespaced by choir and song, unique by asset id. */
export const storageKeyFor = (orgId: string, songId: string, assetId: string, filename: string) =>
  `org/${orgId}/song/${songId}/${assetId}-${safeFilename(filename)}`

export type AssetStatus = 'uploading' | 'ready' | 'failed'

/** A score or audio file of a song. Its bytes live in storage under `storageKey`. */
export interface Asset {
  id: string
  songId: string
  kind: 'score' | 'audio'
  label: string | null
  storageKey: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  peaks: Array<number> | null
  status: AssetStatus
  createdAt: Date
}

/**
 * Waveform of an audio file, computed in the browser: lets the player stream
 * the file instead of downloading and decoding it whole before playing.
 */
export const AudioWaveform = Schema.Struct({
  peaks: Schema.Array(Schema.Number.pipe(Schema.between(0, 1))).pipe(Schema.minItems(1), Schema.maxItems(2000)),
  durationMs: Schema.Int.pipe(Schema.between(1, 24 * 60 * 60 * 1000)),
})
export type AudioWaveform = typeof AudioWaveform.Type
