export type SharedAsset = {
  id: string
  kind: 'score' | 'audio'
  label: string | null
  mimeType: string
  status: 'uploading' | 'ready' | 'failed'
  groups: Array<{ id: string; name: string }>
  url: string
}

export type SharedItem = {
  song: { id: string; title: string }
  assets: Array<SharedAsset>
}

export type BundleFile = { assetId: string; url: string; title: string; label: string | null }

export type Bundle = {
  key: string
  audience: string
  groupCount: number
  tracks: Array<BundleFile>
  scores: Array<BundleFile>
}

export function formatAudience(names: Array<string>) {
  if (names.length === 0) return 'Tout le monde'
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

// One bundle per exact set of groups a file is shared with ("Soprano et Basse"
// is distinct from "Basse"). Untagged files form the "Tout le monde" bundle.
// Bundles only exist when they hold at least one playable track or PDF.
export function buildBundles(items: Array<SharedItem>): Array<Bundle> {
  const bundles = new Map<string, Bundle>()
  for (const item of items) {
    for (const a of item.assets) {
      if (a.status !== 'ready') continue
      const isTrack = a.kind === 'audio'
      const isPdf = a.kind === 'score' && a.mimeType === 'application/pdf'
      if (!isTrack && !isPdf) continue

      const key = a.groups
        .map((g) => g.id)
        .sort()
        .join('+')
      let bundle = bundles.get(key)
      if (!bundle) {
        bundle = {
          key,
          audience: formatAudience(a.groups.map((g) => g.name)),
          groupCount: a.groups.length,
          tracks: [],
          scores: [],
        }
        bundles.set(key, bundle)
      }
      const file = { assetId: a.id, url: a.url, title: item.song.title, label: a.label }
      if (isTrack) bundle.tracks.push(file)
      else bundle.scores.push(file)
    }
  }
  return [...bundles.values()].sort(
    (a, b) => a.groupCount - b.groupCount || a.audience.localeCompare(b.audience, 'fr'),
  )
}
