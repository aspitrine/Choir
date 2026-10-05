import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/primitives/dialog'
import { PdfViewer } from '@/shared/ui/media/pdf-viewer'
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

// Plays every track in order and wraps back to the first one, forever.
function LoopPlaylistPlayer({ token, tracks }: { token: string; tracks: Array<BundleFile> }) {
  const queryClient = useQueryClient()
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

  const indexRef = useRef(index)
  indexRef.current = index

  // Lock-screen / headset controls drive whichever player is playing — not the
  // last one mounted — so claim them on every play (incl. each new track).
  const claimMediaSession = () => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const track = tracks[indexRef.current % tracks.length]!
    navigator.mediaSession.metadata = new MediaMetadata({ title: fileTitle(track) })
    const step = (delta: number) => () => {
      wantPlay.current = true
      goTo(indexRef.current + delta)
    }
    navigator.mediaSession.setActionHandler('nexttrack', tracks.length > 1 ? step(1) : null)
    navigator.mediaSession.setActionHandler('previoustrack', tracks.length > 1 ? step(-1) : null)
  }

  const onPlay = () => {
    wantPlay.current = true
    // One voice at a time: starting a playlist pauses the others on the page.
    document.querySelectorAll<HTMLAudioElement>('audio[data-loop-player]').forEach((other) => {
      if (other !== audioRef.current && !other.paused) other.pause()
    })
    claimMediaSession()
  }

  const onError = async () => {
    // Presigned URLs expire: fetch fresh ones once per track before giving up.
    if (!refreshed.current.has(current.assetId)) {
      refreshed.current.add(current.assetId)
      try {
        const urls = await queryClient.fetchQuery(
          publicQueries.assetUrls(
            token,
            tracks.map((t) => t.assetId),
          ),
        )
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
        data-loop-player=""
        onPlay={onPlay}
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
