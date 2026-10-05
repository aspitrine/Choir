export interface ShareLinkState {
  revokedAt: Date | null
  expiresAt: Date | null
}

export const isLinkActive = (link: ShareLinkState, now: Date) =>
  !link.revokedAt && !(link.expiresAt && link.expiresAt < now)

/**
 * A link without groups shows every file. A link filtered on groups shows files
 * tagged with at least one of them, plus untagged files (shared with everyone).
 */
export function isVisibleThroughLink(assetGroupIds: ReadonlyArray<string>, linkGroupIds: ReadonlyArray<string>) {
  if (linkGroupIds.length === 0 || assetGroupIds.length === 0) return true
  return assetGroupIds.some((id) => linkGroupIds.includes(id))
}

/** Capability URL to a playlist; anyone holding the token can view it while active. */
export interface ShareLink extends ShareLinkState {
  id: string
  playlistId: string
  token: string
  createdAt: Date
}
