import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { Button } from '@/shared/ui/primitives/button'
import { formatTime, playback, usePlayback } from './playback'

/**
 * Mini player pinned to the bottom of every page while a file is loaded: the
 * listener keeps control once the dialog it started from is closed.
 */
export function NowPlayingBar() {
  const state = usePlayback()
  const { track } = state
  if (!track) return null
  const progress = state.duration > 0 ? Math.min(state.currentTime / state.duration, 1) : 0

  return (
    <>
      {/* Keeps the end of the page reachable above the bar. */}
      <div className="h-16" aria-hidden />
      <div
        role="region"
        aria-label="Lecture en cours"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div
          className="h-1 cursor-pointer bg-muted"
          onPointerDown={(e) => {
            if (state.duration <= 0) return
            const rect = e.currentTarget.getBoundingClientRect()
            playback.seek(((e.clientX - rect.left) / rect.width) * state.duration)
          }}
        >
          <div className="h-full bg-foreground" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mx-auto flex h-15 max-w-5xl items-center gap-3 px-4">
          {state.error ? (
            <Button
              size="icon"
              variant="outline"
              aria-label="Reprendre"
              disabled={state.error === 'unsupported'}
              onClick={() => playback.resume()}
            >
              <RotateCcw />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              aria-label={state.playing ? 'Pause' : 'Lecture'}
              onClick={() => playback.toggle(track)}
            >
              {state.playing ? <Pause /> : <Play />}
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{track.media.songTitle}</p>
            <p className="truncate text-xs text-muted-foreground">
              {state.error === 'unsupported'
                ? 'Format non pris en charge par ce navigateur'
                : state.error === 'interrupted'
                  ? 'Lecture interrompue (connexion perdue ?)'
                  : state.buffering
                    ? 'Chargement…'
                    : track.media.assetLabel || 'Audio'}
            </p>
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTime(state.currentTime)} / {formatTime(state.duration)}
          </span>
          <Button size="icon" variant="ghost" aria-label="Fermer le lecteur" onClick={() => playback.close()}>
            <X />
          </Button>
        </div>
      </div>
    </>
  )
}
