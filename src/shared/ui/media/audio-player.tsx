import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Button } from '@/shared/ui/primitives/button'
import { useStableUrl } from './use-stable-url'
import { pauseOtherPlayers, registerPlayer } from './exclusive-playback'
import { createListenTracker, isAtEnd, trackDownload, type MediaContext } from './media-analytics'

export function AudioPlayer({ url: latestUrl, media }: { url: string; media: MediaContext }) {
  const url = useStableUrl(latestUrl)
  const mediaRef = useRef(media)
  mediaRef.current = media
  const containerRef = useRef<HTMLDivElement>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    setError(false)
    setReady(false)

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'oklch(0.708 0 0)',
      progressColor: 'oklch(0.205 0 0)',
      height: 48,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      url,
    })
    waveSurferRef.current = waveSurfer
    const player = { pause: () => waveSurfer.pause() }
    const unregister = registerPlayer(player)
    const listening = createListenTracker()
    const leavePage = () => listening.stop()
    window.addEventListener('pagehide', leavePage)

    waveSurfer.on('ready', () => setReady(true))
    waveSurfer.on('play', () => {
      setPlaying(true)
      pauseOtherPlayers(player)
      listening.play(mediaRef.current, waveSurfer.getCurrentTime())
    })
    waveSurfer.on('timeupdate', (time) => listening.progress(time))
    // The media fires `pause` right before `finish`: tell an end from a pause there.
    waveSurfer.on('pause', () => {
      setPlaying(false)
      listening.stop(isAtEnd(waveSurfer.getCurrentTime(), waveSurfer.getDuration()))
    })
    waveSurfer.on('finish', () => setPlaying(false))
    // Most browsers can't decode AIFF (and some other legacy formats) — fall
    // back to a plain download instead of a stuck, silent player.
    waveSurfer.on('error', () => setError(true))

    return () => {
      listening.stop()
      window.removeEventListener('pagehide', leavePage)
      unregister()
      waveSurfer.destroy()
      waveSurferRef.current = null
    }
  }, [url])

  if (error) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-destructive">
          Ce format audio n'est pas pris en charge par votre navigateur pour l'écoute.
        </p>
        <a
          href={latestUrl}
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
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        className="w-20 shrink-0"
        disabled={!ready}
        onClick={() => waveSurferRef.current?.playPause()}
      >
        {playing ? 'Pause' : 'Écouter'}
      </Button>
      <div ref={containerRef} className="min-w-0 flex-1" />
    </div>
  )
}
