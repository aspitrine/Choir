import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/primitives/dialog'
import { PdfViewer } from '@/shared/ui/media/pdf-viewer'
import { pauseOtherPlayers, registerPlayer } from '@/shared/ui/media/exclusive-playback'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { publicQueries } from '@/features/sharing/ui/queries'
import { mergePdfs, NoPagesError } from '@/features/sharing/ui/merge-pdfs'
import { buildBundles, type BundleFile, type SharedItem } from '@/features/sharing/domain/share-bundles'

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

const URL_REFRESH_COOLDOWN = 60 * 1000

// Plays every track in order and wraps back to the first one, forever.
function LoopPlaylistPlayer({ token, tracks }: { token: string; tracks: Array<BundleFile> }) {
  const queryClient = useQueryClient()
  const audioRef = useRef<HTMLAudioElement>(null)
  // Followed by key, not position: a refetch may reorder or drop tracks while
  // one is playing.
  const [currentKey, setCurrentKey] = useState(tracks[0]!.key)
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Set<string>>(new Set())
  // Keep playing across src changes (next track, refreshed URL) only if the
  // user had playback running.
  const wantPlay = useRef(false)
  const refreshedAt = useRef(new Map<string, number>())

  const found = tracks.findIndex((t) => t.key === currentKey)
  const index = found === -1 ? 0 : found
  const current = tracks[index]!
  const latestUrl = freshUrls[current.assetId] ?? current.url
  // The playlist refetch renews every presigned URL: switching the loaded
  // track's src would restart it mid-song, so only take the renewed URL when
  // moving to another track (or after an explicit refresh).
  const [loaded, setLoaded] = useState({ key: current.key, url: latestUrl })
  if (loaded.key !== current.key) setLoaded({ key: current.key, url: latestUrl })
  const src = loaded.key === current.key ? loaded.url : latestUrl

  // Read by callbacks that outlive this render (media session, async onError).
  const latest = useRef({ tracks, index })
  latest.current = { tracks, index }
  const goTo = (next: number) => {
    const { tracks } = latest.current
    setCurrentKey(tracks[((next % tracks.length) + tracks.length) % tracks.length]!.key)
  }
  const step = (delta: number) => goTo(latest.current.index + delta)

  const [player] = useState(() => ({ pause: () => audioRef.current?.pause() }))
  useEffect(() => registerPlayer(player), [player])

  // Keyed on the track too: the same file twice in a row keeps the same src.
  useEffect(() => {
    if (wantPlay.current) audioRef.current?.play().catch(() => {})
  }, [src, current.key])

  // Lock-screen / headset controls drive whichever player is playing — not the
  // last one mounted — so claim them on every play (incl. each new track).
  const claimMediaSession = () => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: fileTitle(current) })
    const skip = (delta: number) => () => {
      wantPlay.current = true
      step(delta)
    }
    navigator.mediaSession.setActionHandler('nexttrack', tracks.length > 1 ? skip(1) : null)
    navigator.mediaSession.setActionHandler('previoustrack', tracks.length > 1 ? skip(-1) : null)
  }

  const onPlay = () => {
    wantPlay.current = true
    pauseOtherPlayers(player)
    claimMediaSession()
  }

  // A track that plays again (network back, refreshed URL) is no longer broken.
  const onPlaying = () => {
    if (failed.has(current.assetId)) setFailed((prev) => new Set([...prev].filter((id) => id !== current.assetId)))
  }

  const onError = async () => {
    const failedKey = current.key
    const failedId = current.assetId
    // Presigned URLs expire (a looping playlist outlives them): fetch fresh ones,
    // unless this track was just refreshed and still fails — then it's broken.
    const lastRefresh = refreshedAt.current.get(failedId)
    if (lastRefresh === undefined || Date.now() - lastRefresh > URL_REFRESH_COOLDOWN) {
      refreshedAt.current.set(failedId, Date.now())
      try {
        const urls = await queryClient.fetchQuery(
          publicQueries.assetUrls(
            token,
            tracks.map((t) => t.assetId),
          ),
        )
        setFreshUrls((prev) => ({ ...prev, ...urls }))
        const url = urls[failedId]
        if (url) setLoaded({ key: failedKey, url })
        return
      } catch {
        // fall through to skipping the track
      }
    }
    const nextFailed = new Set(failed).add(failedId)
    setFailed(nextFailed)
    if (nextFailed.size < latest.current.tracks.length) step(1)
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
        onPlay={onPlay}
        onPlaying={onPlaying}
        onPause={() => (wantPlay.current = false)}
        onEnded={() => {
          wantPlay.current = true
          step(1)
        }}
        onError={onError}
      />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {index + 1} / {tracks.length} · {fileTitle(current)}
        </span>
        {tracks.length > 1 ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" size="sm" onClick={() => step(-1)}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" onClick={() => step(1)}>
              Suivant
            </Button>
          </div>
        ) : null}
      </div>
      {tracks.length > 1 ? (
        <ol className="divide-y rounded-md border text-sm">
          {tracks.map((t, i) => (
            <li key={t.key}>
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
  const queryClient = useQueryClient()
  const [merged, setMerged] = useState<{ url: string; pages: number } | null>(null)

  useEffect(() => () => {
    if (merged) URL.revokeObjectURL(merged.url)
  }, [merged])

  const merge = useMutation({
    mutationFn: async () => {
      // Fresh URLs: the page may have been open longer than they live.
      const urls = await queryClient.fetchQuery(
        publicQueries.assetUrls(
          token,
          scores.map((s) => s.assetId),
        ),
      )
      return mergePdfs(scores.flatMap((s) => (urls[s.assetId] ? [urls[s.assetId]!] : [])))
    },
    onSuccess: ({ bytes, pages }) => {
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
      setMerged({ url: URL.createObjectURL(blob), pages })
    },
    onError: (error) =>
      toast.error(error instanceof NoPagesError ? 'Aucune page à afficher' : 'Impossible de fusionner les partitions'),
  })

  return (
    <>
      <Button variant="outline" size="sm" disabled={merge.isPending} onClick={() => merge.mutate()}>
        {merge.isPending ? 'Fusion…' : `Partitions (${scores.length} PDF)`}
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
