import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PdfViewer } from '@/components/pdf-viewer'
import { getPublicAssetUrlsFn } from '@/server/shareLinks'

type SharedAsset = {
  id: string
  kind: 'score' | 'audio'
  label: string | null
  mimeType: string
  status: 'uploading' | 'ready' | 'failed'
  groups: Array<{ id: string; name: string }>
  url: string
}

type SharedItem = {
  song: { id: string; title: string }
  assets: Array<SharedAsset>
}

type BundleFile = { assetId: string; url: string; title: string; label: string | null }

type Bundle = {
  key: string
  audience: string
  groupCount: number
  tracks: Array<BundleFile>
  scores: Array<BundleFile>
}

function formatAudience(names: Array<string>) {
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

export function SharedBundles({ token, items }: { token: string; items: Array<SharedItem> }) {
  const bundles = buildBundles(items)
  if (bundles.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Par pupitre</h2>
      {bundles.map((bundle) => (
        <div key={bundle.key} className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{bundle.audience}</h3>
            {bundle.scores.length > 0 ? (
              <MergedPdfButton token={token} audience={bundle.audience} scores={bundle.scores} />
            ) : null}
          </div>
          {bundle.tracks.length > 0 ? <LoopPlaylistPlayer token={token} tracks={bundle.tracks} /> : null}
        </div>
      ))}
    </section>
  )
}

function fileTitle(f: BundleFile) {
  return f.label ? `${f.title} — ${f.label}` : f.title
}

// Plays every track in order and wraps back to the first one, forever.
function LoopPlaylistPlayer({ token, tracks }: { token: string; tracks: Array<BundleFile> }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [index, setIndex] = useState(0)
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Set<string>>(new Set())
  // Keep playing across src changes (next track, refreshed URL) only if the
  // user had playback running.
  const wantPlay = useRef(false)
  const refreshed = useRef(new Set<string>())

  const current = tracks[index % tracks.length]!
  const src = freshUrls[current.assetId] ?? current.url

  const goTo = (next: number) => setIndex(((next % tracks.length) + tracks.length) % tracks.length)

  useEffect(() => {
    if (wantPlay.current) audioRef.current?.play().catch(() => {})
  }, [src])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: fileTitle(current) })
    if (tracks.length > 1) {
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        wantPlay.current = true
        goTo(index + 1)
      })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        wantPlay.current = true
        goTo(index - 1)
      })
    }
  }, [index, current, tracks.length])

  const onError = async () => {
    // Presigned URLs expire: fetch fresh ones once per track before giving up.
    if (!refreshed.current.has(current.assetId)) {
      refreshed.current.add(current.assetId)
      try {
        const urls = await getPublicAssetUrlsFn({
          data: { token, assetIds: tracks.map((t) => t.assetId) },
        })
        setFreshUrls((prev) => ({ ...prev, ...urls }))
        return
      } catch {
        // fall through to skipping the track
      }
    }
    const nextFailed = new Set(failed).add(current.assetId)
    setFailed(nextFailed)
    if (nextFailed.size < tracks.length) goTo(index + 1)
    else wantPlay.current = false
  }

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={src}
        controls
        preload="none"
        loop={tracks.length === 1}
        className="w-full"
        onPlay={() => (wantPlay.current = true)}
        onPause={() => (wantPlay.current = false)}
        onEnded={() => {
          wantPlay.current = true
          goTo(index + 1)
        }}
        onError={onError}
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {index + 1} / {tracks.length} · {fileTitle(current)}
        </span>
        {tracks.length > 1 ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" onClick={() => goTo(index - 1)}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" onClick={() => goTo(index + 1)}>
              Suivant
            </Button>
          </div>
        ) : null}
      </div>
      {tracks.length > 1 ? (
        <ol className="divide-y rounded-md border text-sm">
          {tracks.map((t, i) => (
            <li key={t.assetId}>
              <button
                className={`flex w-full gap-2 px-3 py-1.5 text-left hover:bg-accent ${i === index ? 'font-medium' : ''} ${failed.has(t.assetId) ? 'text-muted-foreground line-through' : ''}`}
                onClick={() => {
                  wantPlay.current = true
                  goTo(i)
                  // Same track clicked again: the src effect won't fire.
                  if (i === index) audioRef.current?.play().catch(() => {})
                }}
              >
                <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
                <span className="truncate">{fileTitle(t)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

// Merges every PDF of the bundle, in playlist order, into one document.
function MergedPdfButton({
  token,
  audience,
  scores,
}: {
  token: string
  audience: string
  scores: Array<BundleFile>
}) {
  const [loading, setLoading] = useState(false)
  const [merged, setMerged] = useState<{ url: string; pages: number } | null>(null)

  useEffect(() => () => {
    if (merged) URL.revokeObjectURL(merged.url)
  }, [merged])

  const merge = async () => {
    setLoading(true)
    try {
      const { PDFDocument } = await import('pdf-lib')
      const urls = await getPublicAssetUrlsFn({
        data: { token, assetIds: scores.map((s) => s.assetId) },
      })
      const out = await PDFDocument.create()
      for (const s of scores) {
        const url = urls[s.assetId]
        if (!url) continue
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const doc = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true })
        const pages = await out.copyPages(doc, doc.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      }
      const pages = out.getPageCount()
      if (pages === 0) {
        toast.error('Aucune page à afficher')
        return
      }
      const bytes = await out.save()
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      setMerged({ url: URL.createObjectURL(blob), pages })
    } catch {
      toast.error('Impossible de fusionner les partitions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={loading} onClick={merge}>
        {loading ? 'Fusion…' : `Partitions (${scores.length} PDF)`}
      </Button>
      <Dialog open={merged !== null} onOpenChange={(open) => !open && setMerged(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Partitions — {audience}</DialogTitle>
            <DialogDescription>
              {scores.length} partition{scores.length > 1 ? 's' : ''} · {merged?.pages ?? 0} page
              {(merged?.pages ?? 0) > 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          {merged ? (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto">
              <PdfViewer url={merged.url} />
              <a
                href={merged.url}
                download={`Partitions - ${audience}.pdf`}
                className="inline-block text-xs text-muted-foreground hover:underline"
              >
                Télécharger
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
