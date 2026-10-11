import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/shared/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/primitives/dialog'
import { PdfViewer } from '@/shared/ui/media/pdf-viewer'
import { pauseOtherPlayers, registerPlayer } from '@/shared/ui/media/exclusive-playback'
import { createListenTracker, isAtEnd } from '@/shared/ui/media/media-analytics'
import { track } from '@/shared/ui/lib/analytics'
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

/** Stable address of a shared file: the server redirects to a fresh presigned URL. */
export function publicFileUrl(token: string, assetId: string) {
  return `/api/public/${encodeURIComponent(token)}/files/${encodeURIComponent(assetId)}`
}

// Plays every track in order and wraps back to the first one, forever.
function LoopPlaylistPlayer({ token, tracks }: { token: string; tracks: Array<BundleFile> }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  // Followed by key, not position: a refetch may reorder or drop tracks while
  // one is playing.
  const [currentKey, setCurrentKey] = useState(tracks[0]!.key)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  // Keep playing across track changes only if the user had playback running.
  const wantPlay = useRef(false)

  const found = tracks.findIndex((t) => t.key === currentKey)
  const index = found === -1 ? 0 : found
  const current = tracks[index]!
  // Never expires, and stays the same when the playlist refetch renews the
  // presigned URLs: the loaded track is never reloaded under the listener.
  const src = publicFileUrl(token, current.assetId)

  // Read by callbacks that outlive this render (media session).
  const latest = useRef({ tracks, index })
  latest.current = { tracks, index }
  const goTo = (next: number) => {
    const { tracks } = latest.current
    setCurrentKey(tracks[((next % tracks.length) + tracks.length) % tracks.length]!.key)
  }
  const step = (delta: number) => goTo(latest.current.index + delta)

  // Moves on and starts the next track within the calling media event: phones
  // only let a page start audio from there while the screen is locked or the
  // tab is in the background — a play() from a later React effect is refused.
  const playStep = (delta: number) => {
    wantPlay.current = true
    flushSync(() => step(delta))
    audioRef.current?.play().catch(() => {})
  }

  const [player] = useState(() => ({ pause: () => audioRef.current?.pause() }))
  useEffect(() => registerPlayer(player), [player])

  const [listening] = useState(() => createListenTracker())
  useEffect(() => {
    const leavePage = () => listening.stop()
    window.addEventListener('pagehide', leavePage)
    return () => {
      window.removeEventListener('pagehide', leavePage)
      listening.stop()
    }
  }, [listening])

  // Keyed on the track too: the same file twice in a row keeps the same src.
  useEffect(() => {
    if (wantPlay.current) audioRef.current?.play().catch(() => {})
  }, [src, current.key])

  // Lock-screen / headset controls drive whichever player is playing — not the
  // last one mounted — so claim them on every play (incl. each new track).
  const claimMediaSession = () => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: fileTitle(current) })
    const skip = (delta: number) => () => playStep(delta)
    navigator.mediaSession.setActionHandler('nexttrack', tracks.length > 1 ? skip(1) : null)
    navigator.mediaSession.setActionHandler('previoustrack', tracks.length > 1 ? skip(-1) : null)
  }

  const onPlay = () => {
    wantPlay.current = true
    pauseOtherPlayers(player)
    claimMediaSession()
    listening.play(
      { source: 'shared_bundle', songTitle: current.title, assetId: current.assetId, assetLabel: current.label },
      audioRef.current?.currentTime ?? 0,
    )
  }

  // The media fires `pause` right before `ended`: tell an end from a pause there.
  const onPause = () => {
    wantPlay.current = false
    const audio = audioRef.current
    listening.stop(audio ? isAtEnd(audio.currentTime, audio.duration) : false)
  }

  // A track that plays again (network back) is no longer broken.
  const onPlaying = () => {
    if (failed.has(current.assetId)) setFailed((prev) => new Set([...prev].filter((id) => id !== current.assetId)))
  }

  // The URL can't expire, so an error means a broken file or no network: skip
  // it, unless every track failed.
  const onError = () => {
    const nextFailed = new Set(failed).add(current.assetId)
    setFailed(nextFailed)
    if (!wantPlay.current) return
    if (nextFailed.size < new Set(tracks.map((t) => t.assetId)).size) playStep(1)
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
        onPause={onPause}
        onTimeUpdate={(e) => listening.progress(e.currentTarget.currentTime)}
        onEnded={() => playStep(1)}
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
      track('scores_merged', { audience, score_count: scores.length, pages })
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
                onClick={() =>
                  track('file_download', { kind: 'merged_scores', source: 'shared_bundle', audience, score_count: scores.length })
                }
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
