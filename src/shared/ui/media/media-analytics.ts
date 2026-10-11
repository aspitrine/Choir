import { track } from '@/shared/ui/lib/analytics'

/** The file being played, viewed or downloaded, attached to its events. */
export type MediaContext = {
  source: string
  songTitle: string
  assetId: string
  assetLabel?: string | null
  songId?: string
}

/** Playback stopped at (or within half a second of) the end of the track. */
export function isAtEnd(currentTime: number, duration: number) {
  return duration > 0 && currentTime >= duration - 0.5
}

const mediaProperties = (ctx: MediaContext) => ({
  source: ctx.source,
  song_title: ctx.songTitle,
  asset_id: ctx.assetId,
  asset_label: ctx.assetLabel ?? undefined,
  song_id: ctx.songId,
})

// Gaps above this between two progress ticks are seeks, not listening.
const MAX_TICK_SECONDS = 2

/**
 * Measures the time actually listened to one track (seeks and pauses excluded).
 * `audio_play` is sent when playback starts; `audio_listen` (with the listened
 * seconds) when a listening stretch ends: pause, end, track change or page exit.
 */
export function createListenTracker(send: typeof track = track) {
  let context: MediaContext | null = null
  let listened = 0
  let last: number | null = null

  return {
    play(ctx: MediaContext, currentTime: number) {
      if (context && context.assetId !== ctx.assetId) this.stop()
      if (!context) send('audio_play', mediaProperties(ctx))
      context = ctx
      last = currentTime
    },
    progress(currentTime: number) {
      if (last !== null) {
        const delta = currentTime - last
        if (delta > 0 && delta <= MAX_TICK_SECONDS) listened += delta
      }
      last = currentTime
    },
    /** Ends the current stretch; `completed` when the track played to its end. */
    stop(completed = false) {
      if (context && listened >= 1) {
        send('audio_listen', { ...mediaProperties(context), seconds: Math.round(listened), completed })
      }
      context = null
      listened = 0
      last = null
    },
  }
}

/** A file opened or saved from its "Télécharger" link. */
export function trackDownload(kind: 'score' | 'audio', file: MediaContext) {
  track('file_download', { ...mediaProperties(file), kind })
}

/** A score rendered in the PDF viewer. */
export function trackScoreView(file: MediaContext, pages: number) {
  track('score_view', { ...mediaProperties(file), pages })
}
