import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Button } from '@/shared/ui/primitives/button'

export function AudioPlayer({ url }: { url: string }) {
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

    waveSurfer.on('ready', () => setReady(true))
    waveSurfer.on('play', () => setPlaying(true))
    waveSurfer.on('pause', () => setPlaying(false))
    waveSurfer.on('finish', () => setPlaying(false))
    // Most browsers can't decode AIFF (and some other legacy formats) — fall
    // back to a plain download instead of a stuck, silent player.
    waveSurfer.on('error', () => setError(true))

    return () => {
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
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
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
