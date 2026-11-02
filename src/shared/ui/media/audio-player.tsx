import { useEffect, useRef, useState } from 'react'
import { Button } from '@/shared/ui/primitives/button'
import { formatTime, playback, usePlayback, type Track } from './playback'
import { Waveform } from './waveform'
import { fetchWaveform, type Waveform as WaveformData } from './waveform-peaks'
import { trackDownload, type MediaContext } from './media-analytics'

// Files being analyzed in this tab: two players of the same file analyze it once.
const analyzing = new Set<string>()

/**
 * Plays a file through the app-wide player (see playback.ts): playback goes on
 * with the screen locked, the dialog closed or on another page, where the mini
 * player takes over.
 */
export function AudioPlayer({
  src,
  downloadUrl,
  mimeType,
  peaks: storedPeaks,
  durationMs,
  media,
  saveWaveform,
}: {
  /** Stable address of the file (never expires). */
  src: string
  downloadUrl: string
  mimeType: string
  peaks: ReadonlyArray<number> | null
  durationMs: number | null
  media: MediaContext
  /** Stores the waveform of a file uploaded before waveforms existed (members only). */
  saveWaveform?: (waveform: WaveformData) => Promise<unknown>
}) {
  const state = usePlayback()
  const [computed, setComputed] = useState<WaveformData | null>(null)
  // Callers pass a new function on every render: the analysis must not restart with it.
  const save = useRef(saveWaveform)
  save.current = saveWaveform
  const canSave = saveWaveform !== undefined
  const peaks = storedPeaks ?? computed?.peaks ?? null
  const track: Track = { assetId: media.assetId, src, mimeType, durationMs: durationMs ?? computed?.durationMs ?? null, media }
  const current = state.track?.assetId === media.assetId
  const duration = current && state.duration > 0 ? state.duration : (track.durationMs ?? 0) / 1000
  const currentTime = current ? state.currentTime : 0

  // Older files have no stored waveform: compute it once, while nothing plays
  // (downloading and decoding a whole file is what the streaming player avoids).
  useEffect(() => {
    if (storedPeaks || !canSave || analyzing.has(media.assetId)) return
    let cancelled = false
    const timer = setTimeout(async () => {
      if (playback.getState().playing) return
      analyzing.add(media.assetId)
      const waveform = await fetchWaveform(src)
      if (!waveform) return
      if (!cancelled) setComputed(waveform)
      await save.current?.(waveform).catch(() => {})
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [storedPeaks, canSave, media.assetId, src])

  if (current && state.error === 'unsupported') {
    return (
      <div className="space-y-1">
        <p className="text-sm text-destructive">
          Ce format audio n'est pas pris en charge par votre navigateur pour l'écoute.
        </p>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => trackDownload('audio', media)}
        >
          Télécharger le fichier
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="w-20 shrink-0" onClick={() => playback.toggle(track)}>
          {current && state.playing ? 'Pause' : current && state.currentTime > 0 ? 'Reprendre' : 'Écouter'}
        </Button>
        <Waveform
          className="min-w-0 flex-1"
          peaks={peaks}
          currentTime={currentTime}
          duration={duration}
          // Tapping the waveform of another file starts it there.
          onSeek={(seconds) => (current ? playback.seek(seconds) : playback.play(track, seconds))}
        />
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {current ? `${formatTime(currentTime)} / ` : ''}
          {formatTime(duration)}
        </span>
      </div>
      {current && state.error === 'interrupted' ? (
        <p className="text-xs text-destructive">
          Lecture interrompue (connexion perdue ?).{' '}
          <button className="underline" onClick={() => playback.resume()}>
            Reprendre
          </button>
        </p>
      ) : current && state.buffering ? (
        <p className="text-xs text-muted-foreground">Chargement…</p>
      ) : null}
    </div>
  )
}
