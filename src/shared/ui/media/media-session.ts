// Phones keep a page's audio playing with the screen locked only if the OS
// treats it as playback. iOS Safari may class a page's sound as "ambient"
// (muted by the silent switch, stopped when the screen locks) once it has
// used Web Audio: ask for playback explicitly (Safari 17+, ignored elsewhere).
export function preferPlaybackAudioSession() {
  if (typeof navigator === 'undefined') return
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && session.type !== 'playback') session.type = 'playback'
}

type Handlers = Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>

const ACTIONS: Array<MediaSessionAction> = [
  'play',
  'pause',
  'stop',
  'seekbackward',
  'seekforward',
  'seekto',
  'previoustrack',
  'nexttrack',
]

/**
 * Lock-screen / headset controls drive whichever player is playing — not the
 * last one mounted — so the player that starts claims every action: the ones
 * it doesn't handle are cleared, not left pointing at the previous player.
 */
export function claimMediaSession(metadata: MediaMetadataInit, handlers: Handlers) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata(metadata)
  for (const action of ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, handlers[action] ?? null)
    } catch {
      // Action unknown to this browser.
    }
  }
}

/** Keeps the lock-screen progress bar in step with the player. */
export function updateMediaPosition(audio: HTMLMediaElement) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(audio.currentTime, audio.duration),
      playbackRate: audio.playbackRate || 1,
    })
  } catch {
    // Older browsers: no position on the lock screen.
  }
}
