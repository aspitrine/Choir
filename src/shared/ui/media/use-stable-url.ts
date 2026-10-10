import { useState } from 'react'

const withoutQuery = (url: string) => url.split('?')[0]

/**
 * Presigned URLs get a new signature on every refetch, for the same file.
 * Keeps the first one while it points to the same file, so a refetch doesn't
 * reload media that's already playing or on screen.
 */
export function useStableUrl(url: string) {
  const [stable, setStable] = useState(url)
  const sameFile = withoutQuery(stable) === withoutQuery(url)
  if (!sameFile) setStable(url)
  return sameFile ? stable : url
}
