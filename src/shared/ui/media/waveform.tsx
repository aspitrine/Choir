import type { KeyboardEvent, PointerEvent } from 'react'
import { cn } from '@/shared/ui/lib/utils'
import { formatTime } from './playback'

const BAR_COUNT = 120
// Without a stored waveform (file not analyzed yet): a plain, even bar.
const FLAT = new Array<number>(BAR_COUNT).fill(0.25)

/** Loudest peak of each bar's share of the peaks. */
function toBars(peaks: ReadonlyArray<number>) {
  if (peaks.length <= BAR_COUNT) return [...peaks]
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const start = Math.floor((i * peaks.length) / BAR_COUNT)
    const end = Math.floor(((i + 1) * peaks.length) / BAR_COUNT)
    return Math.max(...peaks.slice(start, end))
  })
}

/**
 * Seekable waveform drawn from stored peaks: no download or decoding of the
 * file to show it, so the player can stream the audio.
 */
export function Waveform({
  peaks,
  currentTime,
  duration,
  onSeek,
  className,
}: {
  peaks: ReadonlyArray<number> | null
  currentTime: number
  duration: number
  onSeek: (seconds: number) => void
  className?: string
}) {
  const bars = peaks && peaks.length > 0 ? toBars(peaks) : FLAT
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
  const seekable = duration > 0

  const seekAt = (e: PointerEvent<HTMLDivElement>) => {
    if (!seekable) return
    const rect = e.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!seekable) return
    const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0
    if (step === 0) return
    e.preventDefault()
    onSeek(Math.max(0, Math.min(duration, currentTime + step)))
  }

  return (
    <div
      role="slider"
      aria-label="Position de lecture"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatTime(currentTime)} sur ${formatTime(duration)}`}
      tabIndex={seekable ? 0 : -1}
      className={cn('flex h-12 cursor-pointer touch-none items-center gap-px', !seekable && 'cursor-default', className)}
      onPointerDown={seekAt}
      onKeyDown={onKeyDown}
    >
      {bars.map((peak, i) => (
        <div
          key={i}
          className={cn('min-w-px flex-1 rounded-full', (i + 0.5) / bars.length <= progress ? 'bg-foreground' : 'bg-muted-foreground/40')}
          style={{ height: `${Math.max(peak, 0.04) * 100}%` }}
        />
      ))}
    </div>
  )
}
