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
  status: AssetStatus
  createdAt: Date
}
